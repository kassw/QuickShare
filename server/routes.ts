import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { z } from "zod";
import type { User } from "@shared/schema";

// WebSocket message types
type WSMessage = {
  type: 'join_match' | 'make_move' | 'leave_match' | 'match_found' | 'game_update' | 'game_result' | 'user_session';
  matchId?: string;
  move?: any;
  gameState?: any;
  result?: 'win' | 'lose' | 'draw';
  winnerId?: string;
  currentPlayer?: string;
  moveNumber?: number;
  user?: any;
};

const connectedClients = new Map<string, WebSocket>();
const userMatches = new Map<string, string>(); // userId -> matchId
const userConnections = new Map<string, string>(); // userId -> websocket connection id
const connectionUsers = new Map<string, string>(); // websocket connection id -> userId
let connectionCounter = 0;

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Initialize guest user
  let guestUser = await storage.getOrCreateGuestUser();

  // Create unique user sessions for each connection
  const createUserSession = async (): Promise<User> => {
    const sessionId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return await storage.createUser({
      username: sessionId,
      nickname: `Player${Math.floor(Math.random() * 9999)}`,
      email: `${sessionId}@retrogame.com`,
      authProvider: "session"
    });
  };

  // API Routes
  app.get("/api/user/:userId?", async (req, res) => {
    const userId = req.params.userId || guestUser.id;
    const user = await storage.getUser(userId);
    const stats = await storage.getUserStats(userId);
    res.json({ user, stats });
  });

  app.get("/api/user/:userId/transactions", async (req, res) => {
    const userId = req.params.userId || guestUser.id;
    const transactions = await storage.getUserTransactions(userId);
    res.json(transactions);
  });

  app.post("/api/matches", async (req, res) => {
    try {
      const { gameType, stake, userId } = req.body;
      const playerId = userId || guestUser.id;
      
      // Check for existing waiting matches
      const waitingMatches = await storage.getWaitingMatches(gameType, stake);
      
      if (waitingMatches.length > 0) {
        // Join existing match
        const match = waitingMatches[0];
        
        if (match.player1Id === playerId) {
          // Can't join your own match, create a new one
          const newMatch = await storage.createMatch({
            gameType,
            stake,
            player1Id: playerId,
            player2Id: null
          });
          
          userMatches.set(playerId, newMatch.id);
          res.json(newMatch);
          return;
        }
        
        const updatedMatch = await storage.updateMatch(match.id, {
          player2Id: playerId,
          state: "in_progress",
          gameData: JSON.stringify(initializeGameState(gameType))
        });
        
        userMatches.set(playerId, match.id);
        
        // Notify both players
        broadcastToMatch(match.id, {
          type: 'match_found',
          matchId: match.id,
          gameState: initializeGameState(gameType)
        });
        
        res.json(updatedMatch);
      } else {
        // Create new match
        const match = await storage.createMatch({
          gameType,
          stake,
          player1Id: playerId,
          player2Id: null
        });
        
        userMatches.set(playerId, match.id);
        res.json(match);
      }
    } catch (error) {
      console.error('Match creation error:', error);
      res.status(500).json({ error: "Failed to create/join match" });
    }
  });

  // Remove the old REST endpoint for moves - now handled via WebSocket only

  app.post("/api/transactions", async (req, res) => {
    try {
      const { type, amount, description } = req.body;
      
      const transaction = await storage.createTransaction({
        userId: guestUser.id,
        type,
        amount,
        description
      });
      
      // Update user balance for mock transactions
      if (type === "deposit") {
        const currentBalance = parseFloat(guestUser.balance ?? '0');
        const newBalance = (currentBalance + parseFloat(amount)).toFixed(2);
        const updatedUser = await storage.updateUserBalance(guestUser.id, newBalance);
        guestUser = updatedUser || guestUser;
      } else if (type === "withdraw") {
        const currentBalance = parseFloat(guestUser.balance ?? '0');
        const newBalance = Math.max(0, currentBalance - parseFloat(amount)).toFixed(2);
        const updatedUser = await storage.updateUserBalance(guestUser.id, newBalance);
        guestUser = updatedUser || guestUser;
      }
      
      res.json(transaction);
    } catch (error) {
      res.status(500).json({ error: "Failed to create transaction" });
    }
  });

  // WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws: WebSocket) => {
    const connectionId = `conn_${++connectionCounter}`;
    const sessionUser = await createUserSession();
    
    connectedClients.set(connectionId, ws);
    userConnections.set(sessionUser.id, connectionId);
    connectionUsers.set(connectionId, sessionUser.id);

    // Send user data to client
    ws.send(JSON.stringify({
      type: 'user_session',
      user: sessionUser
    }));

    ws.on('message', async (data: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'join_match':
            if (message.matchId) {
              userMatches.set(sessionUser.id, message.matchId);
            }
            break;
          case 'leave_match':
            userMatches.delete(sessionUser.id);
            break;
          case 'make_move':
            if (message.matchId && message.move) {
              await handleGameMove(message.matchId, sessionUser.id, message.move);
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      connectedClients.delete(connectionId);
      userMatches.delete(sessionUser.id);
      userConnections.delete(sessionUser.id);
      connectionUsers.delete(connectionId);
    });
  });

  async function handleGameMove(matchId: string, playerId: string, move: any) {
    try {
      const match = await storage.getMatch(matchId);
      if (!match || match.state !== 'in_progress') {
        console.log(`Match ${matchId} not found or not in progress`);
        return;
      }

      const moves = await storage.getMatchMoves(matchId);
      
      // For turn-based games, validate turn order
      if (match.gameType !== 'rps') {
        const expectedPlayer = moves.length % 2 === 0 ? match.player1Id : match.player2Id;
        if (playerId !== expectedPlayer) {
          console.log(`Not ${playerId}'s turn. Expected: ${expectedPlayer}, Move #${moves.length + 1}`);
          return;
        }
      }

      const moveNumber = moves.length + 1;

      const gameMove = await storage.createMove({
        matchId,
        playerId,
        moveData: JSON.stringify(move),
        moveNumber
      });

      console.log(`Move ${moveNumber} by player ${playerId} in match ${matchId}:`, move);

      // Get updated moves after adding the new one
      const allMoves = await storage.getMatchMoves(matchId);
      const gameResult = await processGameMove(match, move, allMoves, playerId);

      console.log(`Game result for match ${matchId}:`, gameResult);

      // Always broadcast the current game state to both players
      const currentPlayer = 'currentPlayer' in gameResult.gameState ? gameResult.gameState.currentPlayer : null;
      broadcastToMatch(matchId, {
        type: 'game_update',
        gameState: gameResult.gameState,
        currentPlayer: currentPlayer,
        moveNumber
      });

      if (gameResult.finished) {
        await storage.updateMatch(matchId, {
          state: "finished",
          winnerId: gameResult.winnerId,
          finishedAt: new Date(),
          gameData: JSON.stringify(gameResult.gameState)
        });

        // Update user stats and balance for both players
        if (match.player1Id) {
          await updateUserAfterGame(gameResult.winnerId === match.player1Id, match.stake, match.player1Id);
        }
        if (match.player2Id) {
          await updateUserAfterGame(gameResult.winnerId === match.player2Id, match.stake, match.player2Id);
        }

        // Send specific result to each player
        if (match.player1Id) {
          const player1ConnectionId = userConnections.get(match.player1Id);
          if (player1ConnectionId) {
            const player1Client = connectedClients.get(player1ConnectionId);
            if (player1Client && player1Client.readyState === WebSocket.OPEN) {
              player1Client.send(JSON.stringify({
                type: 'game_result',
                result: gameResult.winnerId === match.player1Id ? 'win' : 
                        gameResult.winnerId ? 'lose' : 'draw',
                gameState: gameResult.gameState,
                winnerId: gameResult.winnerId
              }));
            }
          }
        }

        if (match.player2Id) {
          const player2ConnectionId = userConnections.get(match.player2Id);
          if (player2ConnectionId) {
            const player2Client = connectedClients.get(player2ConnectionId);
            if (player2Client && player2Client.readyState === WebSocket.OPEN) {
              player2Client.send(JSON.stringify({
                type: 'game_result',
                result: gameResult.winnerId === match.player2Id ? 'win' : 
                        gameResult.winnerId ? 'lose' : 'draw',
                gameState: gameResult.gameState,
                winnerId: gameResult.winnerId
              }));
            }
          }
        }
      }
    } catch (error) {
      console.error('Game move error:', error);
    }
  }

  function broadcastToMatch(matchId: string, message: WSMessage) {
    Array.from(userMatches.entries()).forEach(([userId, userMatchId]) => {
      if (userMatchId === matchId) {
        const connectionId = userConnections.get(userId);
        if (connectionId) {
          const client = connectedClients.get(connectionId);
          if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        }
      }
    });
  }

  function initializeGameState(gameType: string) {
    switch (gameType) {
      case 'rps':
        return { moves: {}, result: null };
      case 'tictactoe':
        return { board: Array(9).fill(null), currentPlayer: 'X' };
      case 'sticks':
        return { sticks: 21, currentPlayer: 1 };
      case 'hangman':
        const words = ['BLOCKCHAIN', 'CRYPTOCURRENCY', 'GAMING', 'RETRO', 'ARCADE'];
        return { 
          word: words[Math.floor(Math.random() * words.length)],
          guessedLetters: [],
          wrongGuesses: 0
        };
      default:
        return {};
    }
  }

  async function processGameMove(match: any, move: any, allMoves: any[], playerId: string) {
    const gameType = match.gameType;
    
    switch (gameType) {
      case 'rps':
        return processRPSMove(match, move, allMoves, playerId);
      case 'tictactoe':
        return processTicTacToeMove(match, move, allMoves, playerId);
      case 'sticks':
        return processSticksMove(match, move, allMoves, playerId);
      case 'hangman':
        return processHangmanMove(match, move, allMoves, playerId);
      default:
        return { finished: false, gameState: {}, winnerId: null };
    }
  }

  function processRPSMove(match: any, moveData: any, allMoves: any[], playerId: string) {
    // Build current state from all moves
    const playerMoves: Record<string, string> = {};
    allMoves.forEach(move => {
      const data = JSON.parse(move.moveData);
      playerMoves[move.playerId] = data.move;
    });

    // Check if both players have moved
    const player1Id = match.player1Id;
    const player2Id = match.player2Id;
    
    if (player1Id && player2Id && playerMoves[player1Id] && playerMoves[player2Id]) {
      const move1 = playerMoves[player1Id];
      const move2 = playerMoves[player2Id];
      
      const result = evaluateRPS(move1, move2);
      let winnerId = null;
      
      if (result === 'player1') winnerId = player1Id;
      else if (result === 'player2') winnerId = player2Id;
      
      return {
        finished: true,
        gameState: { 
          moves: playerMoves, 
          result, 
          move1, 
          move2,
          currentPlayer: null
        },
        winnerId
      };
    }
    
    return {
      finished: false,
      gameState: { 
        moves: playerMoves, 
        waitingFor: !playerMoves[player1Id] ? player1Id : player2Id,
        currentPlayer: null
      },
      winnerId: null
    };
  }

  function processTicTacToeMove(match: any, moveData: any, allMoves: any[], playerId: string) {
    const board = Array(9).fill(null);
    const player1Id = match.player1Id;
    const player2Id = match.player2Id;
    
    // Check if it's the correct player's turn
    const moveNumber = allMoves.length;
    const expectedPlayer = moveNumber % 2 === 0 ? player1Id : player2Id;
    
    // Apply all moves to board
    allMoves.forEach((move, index) => {
      const data = JSON.parse(move.moveData);
      const symbol = index % 2 === 0 ? 'X' : 'O';
      if (data.position !== undefined && board[data.position] === null) {
        board[data.position] = symbol;
      }
    });
    
    const winner = checkTicTacToeWinner(board);
    const finished = winner !== null || !board.includes(null);
    
    let winnerId = null;
    if (winner === 'X') winnerId = player1Id;
    else if (winner === 'O') winnerId = player2Id;
    
    const nextPlayer = moveNumber % 2 === 0 ? player2Id : player1Id;
    
    return {
      finished,
      gameState: { 
        board, 
        currentPlayer: finished ? null : nextPlayer,
        nextSymbol: finished ? null : (moveNumber % 2 === 0 ? 'O' : 'X'),
        winner,
        isYourTurn: (userId: string) => !finished && nextPlayer === userId
      },
      winnerId
    };
  }

  function processSticksMove(match: any, moveData: any, allMoves: any[], playerId: string) {
    let sticks = 21;
    const player1Id = match.player1Id;
    const player2Id = match.player2Id;
    
    // Check if it's the correct player's turn
    const moveNumber = allMoves.length;
    const expectedPlayer = moveNumber % 2 === 0 ? player1Id : player2Id;
    
    // Apply all moves
    allMoves.forEach(move => {
      const data = JSON.parse(move.moveData);
      sticks -= data.take;
    });
    
    if (sticks <= 0) {
      // Player who took the last stick loses
      const winnerId = playerId === player1Id ? player2Id : player1Id;
      return {
        finished: true,
        gameState: { 
          sticks: 0, 
          currentPlayer: null, 
          lastPlayer: playerId,
          gameOver: true
        },
        winnerId
      };
    }
    
    const nextPlayer = playerId === player1Id ? player2Id : player1Id;
    
    return {
      finished: false,
      gameState: { 
        sticks, 
        currentPlayer: nextPlayer,
        lastPlayer: playerId,
        isYourTurn: (userId: string) => nextPlayer === userId
      },
      winnerId: null
    };
  }

  function processHangmanMove(match: any, moveData: any, allMoves: any[], playerId: string) {
    const gameState = JSON.parse(match.gameData || '{}');
    const words = ['BLOCKCHAIN', 'CRYPTOCURRENCY', 'ARCADE', 'RETRO', 'GAMING', 'PIXEL', 'NEON'];
    const word = gameState.word || words[Math.floor(Math.random() * words.length)];
    const player1Id = match.player1Id;
    const player2Id = match.player2Id;
    
    // Build guessed letters from all moves, avoiding duplicates
    const guessedLetters: string[] = [];
    let wrongGuesses = 0;
    
    allMoves.forEach(move => {
      const data = JSON.parse(move.moveData);
      const letter = data.letter?.toUpperCase();
      if (letter && !guessedLetters.includes(letter)) {
        guessedLetters.push(letter);
        if (!word.toUpperCase().includes(letter)) {
          wrongGuesses++;
        }
      }
    });
    
    const wordLetters = word.toUpperCase().split('');
    const isComplete = wordLetters.every((letter: string) => guessedLetters.includes(letter));
    const failed = wrongGuesses >= 6;
    
    // In Hangman, players take turns guessing letters
    const moveNumber = allMoves.length;
    const nextPlayer = moveNumber % 2 === 0 ? player2Id : player1Id;
    
    let winnerId = null;
    if (isComplete) {
      // Player who completed the word wins
      winnerId = playerId;
    } else if (failed) {
      // Both players lose if they fail to guess the word - it's a draw
      winnerId = null;
    }
    
    const displayWord = wordLetters.map((letter: string) => 
      guessedLetters.includes(letter) ? letter : '_'
    ).join(' ');
    
    return {
      finished: isComplete || failed,
      gameState: { 
        word: failed || isComplete ? word : word, // Always show word for debugging
        guessedLetters, 
        wrongGuesses, 
        currentPlayer: (isComplete || failed) ? null : nextPlayer,
        isYourTurn: (userId: string) => !isComplete && !failed && nextPlayer === userId,
        displayWord,
        maxWrongGuesses: 6,
        gameOver: isComplete || failed,
        won: isComplete,
        lost: failed
      },
      winnerId
    };
  }

  function evaluateRPS(move1: string, move2: string) {
    if (move1 === move2) return 'draw';
    const winConditions: Record<string, string> = {
      rock: 'scissors',
      paper: 'rock',
      scissors: 'paper'
    };
    return winConditions[move1] === move2 ? 'player1' : 'player2';
  }

  function checkTicTacToeWinner(board: (string | null)[]) {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    
    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  }

  async function updateUserAfterGame(won: boolean, stake: string, userId: string) {
    const user = await storage.getUser(userId);
    if (!user) return;

    const stakeAmount = parseFloat(stake);
    const currentBalance = parseFloat(user.balance || "0");
    let newBalance = currentBalance;
    let earnedAmount = "0";
    
    if (won) {
      const winnings = stakeAmount * 1.9; // 90% of double stake (10% fee)
      newBalance += winnings;
      earnedAmount = winnings.toFixed(2);
      
      await storage.createTransaction({
        userId,
        type: "win",
        amount: earnedAmount,
        description: "Game victory reward"
      });
    } else {
      newBalance -= stakeAmount;
      
      await storage.createTransaction({
        userId,
        type: "lose",
        amount: stake,
        description: "Game stake lost"
      });
    }
    
    await storage.updateUserBalance(userId, newBalance.toFixed(2));
    
    // Update stats
    const stats = await storage.getUserStats(userId);
    await storage.updateUserStats(userId, {
      totalGames: (stats?.totalGames || 0) + 1,
      totalWins: (stats?.totalWins || 0) + (won ? 1 : 0),
      totalLosses: (stats?.totalLosses || 0) + (won ? 0 : 1),
      totalEarned: (parseFloat(stats?.totalEarned || "0") + parseFloat(earnedAmount)).toFixed(2)
    });
  }

  return httpServer;
}
