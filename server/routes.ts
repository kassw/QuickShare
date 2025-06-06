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

function createInitialGameState(gameType: string, player1Id: string, player2Id: string) {
  switch (gameType) {
    case 'rps':
      return { 
        moves: {}, 
        result: null,
        currentPlayer: null
      };
    case 'tictactoe':
      return { 
        board: Array(9).fill(null), 
        currentPlayer: player1Id,
        winner: null,
        isYourTurn: (userId: string) => userId === player1Id,
        playerSymbol: (userId: string) => userId === player1Id ? 'X' : 'O'
      };
    case 'sticks':
      return { 
        sticks: 21, 
        currentPlayer: player1Id,
        lastPlayer: null,
        isYourTurn: (userId: string) => userId === player1Id
      };
    case 'hangman':
      const words = ['BLOCKCHAIN', 'CRYPTOCURRENCY', 'ARCADE', 'RETRO', 'GAMING', 'PIXEL', 'NEON'];
      const word = words[Math.floor(Math.random() * words.length)];
      return { 
        word,
        guessedLetters: [],
        wrongGuesses: 0,
        currentPlayer: player1Id,
        displayWord: word.split('').map(() => '_').join(' '),
        maxWrongGuesses: 6,
        gameOver: false,
        won: false,
        lost: false,
        isYourTurn: (userId: string) => userId === player1Id
      };
    default:
      return {};
  }
}

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

        // Create proper initial game state with currentPlayer
        const initialGameState = createInitialGameState(gameType, match.player1Id, playerId);

        const updatedMatch = await storage.updateMatch(match.id, {
          player2Id: playerId,
          state: "in_progress",
          gameData: JSON.stringify(initialGameState)
        });

        userMatches.set(playerId, match.id);

        // Notify both players that match was found
        broadcastToMatch(match.id, {
          type: 'match_found',
          matchId: match.id,
          gameState: initialGameState
        });

        // Send initial game state with proper turn information
        setTimeout(() => {
          broadcastToMatch(match.id, {
            type: 'game_update',
            gameState: initialGameState,
            currentPlayer: initialGameState.currentPlayer,
            moveNumber: 0
          });
        }, 100);

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

      // For turn-based games, validate turn order (player2 now goes first)
      if (match.gameType !== 'rps') {
        // Player 2 starts first, so:
        // Move 0: Player 2's turn
        // Move 1: Player 1's turn  
        // Move 2: Player 2's turn
        // etc.
        const expectedPlayer = moves.length % 2 === 0 ? match.player2Id : match.player1Id;
        if (playerId !== expectedPlayer) {
          console.log(`Not ${playerId}'s turn. Expected: ${expectedPlayer} (Player ${expectedPlayer === match.player1Id ? '1' : '2'}), Move #${moves.length + 1}`);
          return;
        }
      }

      // For RPS, allow players to change moves until both have submitted
      if (match.gameType === 'rps') {
        // Check if both players have already made their final moves
        const player1Moves = moves.filter(m => m.playerId === match.player1Id);
        const player2Moves = moves.filter(m => m.playerId === match.player2Id);
        
        if (player1Moves.length > 0 && player2Moves.length > 0) {
          console.log(`Both players have already moved in RPS match ${matchId}`);
          return;
        }
      }

      const moveNumber = moves.length + 1;

      await storage.createMove({
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
        moveNumber: allMoves.length
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



  function createInitialGameState(gameType: string, player1Id: string, player2Id: string) {
    switch (gameType) {
      case 'rps':
        return { 
          moves: {}, 
          result: null,
          currentPlayer: null
        };
      case 'tictactoe':
        return { 
          board: Array(9).fill(null), 
          currentPlayer: player2Id,
          winner: null,
          isYourTurn: (userId: string) => userId === player2Id,
          playerSymbol: (userId: string) => userId === player1Id ? 'X' : 'O'
        };
      case 'sticks':
        return { 
          sticks: 21, 
          currentPlayer: player2Id,
          lastPlayer: null,
          isYourTurn: (userId: string) => userId === player2Id
        };
      case 'hangman':
        const words = ['BLOCKCHAIN', 'CRYPTOCURRENCY', 'ARCADE', 'RETRO', 'GAMING', 'PIXEL', 'NEON'];
        const word = words[Math.floor(Math.random() * words.length)];
        return { 
          word,
          guessedLetters: [],
          wrongGuesses: 0,
          currentPlayer: player2Id,
          displayWord: word.split('').map(() => '_').join(' '),
          maxWrongGuesses: 6,
          gameOver: false,
          won: false,
          lost: false,
          isYourTurn: (userId: string) => userId === player2Id
        };
      default:
        return {};
    }
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
    // Build current state from latest moves for each player
    const playerMoves: Record<string, string> = {};
    
    // Get the latest move for each player
    const player1Id = match.player1Id;
    const player2Id = match.player2Id;
    
    const player1Moves = allMoves.filter(m => m.playerId === player1Id);
    const player2Moves = allMoves.filter(m => m.playerId === player2Id);
    
    if (player1Moves.length > 0) {
      const latestP1Move = player1Moves[player1Moves.length - 1];
      const data = JSON.parse(latestP1Move.moveData);
      playerMoves[player1Id] = data.move;
    }
    
    if (player2Moves.length > 0) {
      const latestP2Move = player2Moves[player2Moves.length - 1];
      const data = JSON.parse(latestP2Move.moveData);
      playerMoves[player2Id] = data.move;
    }

    // Check if both players have moved
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

    // Apply all moves to board (Player 1 = X, Player 2 = O)
    allMoves.forEach((move, index) => {
      const data = JSON.parse(move.moveData);
      const isPlayer1Move = move.playerId === player1Id;
      const symbol = isPlayer1Move ? 'X' : 'O';
      if (data.position !== undefined && board[data.position] === null) {
        board[data.position] = symbol;
      }
    });

    const winner = checkTicTacToeWinner(board);
    const finished = winner !== null || !board.includes(null);

    let winnerId = null;
    if (winner === 'X') winnerId = player1Id;
    else if (winner === 'O') winnerId = player2Id;

    // Next player: since player2 starts first, after each move we alternate
    // After move 0 (player2): player1 goes next
    // After move 1 (player1): player2 goes next
    const nextPlayer = finished ? null : (allMoves.length % 2 === 0 ? player2Id : player1Id);

    return {
      finished,
      gameState: { 
        board, 
        currentPlayer: nextPlayer,
        winner,
        isYourTurn: (userId: string) => !finished && nextPlayer === userId,
        playerSymbol: (userId: string) => userId === player1Id ? 'X' : 'O'
      },
      winnerId
    };
  }

  function processSticksMove(match: any, moveData: any, allMoves: any[], playerId: string) {
    let sticks = 21;
    const player1Id = match.player1Id;
    const player2Id = match.player2Id;

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

    // Next player: since player2 starts first, after each move we alternate
    const nextPlayer = allMoves.length % 2 === 0 ? player2Id : player1Id;

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
    const player1WrongGuesses: string[] = [];
    const player2WrongGuesses: string[] = [];

    allMoves.forEach(move => {
      const data = JSON.parse(move.moveData);
      const letter = data.letter?.toUpperCase();
      if (letter && !guessedLetters.includes(letter)) {
        guessedLetters.push(letter);
        if (!word.toUpperCase().includes(letter)) {
          // Track wrong guesses per player
          if (move.playerId === player1Id) {
            player1WrongGuesses.push(letter);
          } else if (move.playerId === player2Id) {
            player2WrongGuesses.push(letter);
          }
        }
      }
    });

    const wordLetters = word.toUpperCase().split('');
    const isComplete = wordLetters.every((letter: string) => guessedLetters.includes(letter));
    
    // Game ends if word is complete OR if the current player has 6 wrong guesses
    const currentPlayerWrongCount = playerId === player1Id ? player1WrongGuesses.length : player2WrongGuesses.length;
    const playerFailed = currentPlayerWrongCount >= 6;

    // Next player: since player2 starts first, after each move we alternate
    const nextPlayer = (isComplete || playerFailed) ? null : (allMoves.length % 2 === 0 ? player2Id : player1Id);

    let winnerId = null;
    if (isComplete) {
      // Player who completed the word wins
      winnerId = playerId;
    } else if (playerFailed) {
      // The other player wins if current player failed
      winnerId = playerId === player1Id ? player2Id : player1Id;
    }

    const displayWord = wordLetters.map((letter: string) => 
      guessedLetters.includes(letter) ? letter : '_'
    ).join(' ');

    return {
      finished: isComplete || playerFailed,
      gameState: { 
        word: word, // Always include word
        guessedLetters, 
        wrongGuesses: currentPlayerWrongCount, // Show current player's wrong guess count
        player1WrongGuesses: player1WrongGuesses.length,
        player2WrongGuesses: player2WrongGuesses.length,
        currentPlayer: nextPlayer,
        isYourTurn: (userId: string) => !isComplete && !playerFailed && nextPlayer === userId,
        displayWord,
        maxWrongGuesses: 6,
        gameOver: isComplete || playerFailed,
        won: isComplete,
        lost: playerFailed && playerId === (nextPlayer === player1Id ? player2Id : player1Id)
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