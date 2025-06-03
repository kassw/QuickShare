import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { z } from "zod";
import type { User } from "@shared/schema";

// WebSocket message types
type WSMessage = {
  type: 'join_match' | 'make_move' | 'leave_match' | 'match_found' | 'game_update' | 'game_result';
  matchId?: string;
  move?: any;
  gameState?: any;
  result?: 'win' | 'lose' | 'draw';
  winnerId?: string;
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

  app.post("/api/matches/:matchId/moves", async (req, res) => {
    try {
      const { matchId } = req.params;
      const { move } = req.body;
      
      const match = await storage.getMatch(matchId);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }
      
      const moves = await storage.getMatchMoves(matchId);
      const moveNumber = moves.length + 1;
      
      const gameMove = await storage.createMove({
        matchId,
        playerId: guestUser.id,
        moveData: JSON.stringify(move),
        moveNumber
      });
      
      // Process the move and update game state
      const gameResult = await processGameMove(match, gameMove, moves);
      
      if (gameResult.finished) {
        await storage.updateMatch(matchId, {
          state: "finished",
          winnerId: gameResult.winnerId,
          finishedAt: new Date()
        });
        
        // Update user stats and balance
        await updateUserAfterGame(gameResult.winnerId === guestUser.id, match.stake);
        
        broadcastToMatch(matchId, {
          type: 'game_result',
          result: gameResult.winnerId === guestUser.id ? 'win' : 
                  gameResult.winnerId ? 'lose' : 'draw',
          gameState: gameResult.gameState
        });
      } else {
        broadcastToMatch(matchId, {
          type: 'game_update',
          gameState: gameResult.gameState
        });
      }
      
      res.json(gameMove);
    } catch (error) {
      res.status(500).json({ error: "Failed to make move" });
    }
  });

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
        const currentBalance = parseFloat(guestUser.balance);
        const newBalance = (currentBalance + parseFloat(amount)).toFixed(2);
        guestUser = await storage.updateUserBalance(guestUser.id, newBalance) || guestUser;
      } else if (type === "withdraw") {
        const currentBalance = parseFloat(guestUser.balance);
        const newBalance = Math.max(0, currentBalance - parseFloat(amount)).toFixed(2);
        guestUser = await storage.updateUserBalance(guestUser.id, newBalance) || guestUser;
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
      if (!match || match.state !== 'in_progress') return;

      const moves = await storage.getMatchMoves(matchId);
      const moveNumber = moves.length + 1;

      await storage.createMove({
        matchId,
        playerId,
        moveData: JSON.stringify(move),
        moveNumber
      });

      // Get updated moves
      const allMoves = await storage.getMatchMoves(matchId);
      const gameResult = await processGameMove(match, move, allMoves, playerId);

      if (gameResult.finished) {
        await storage.updateMatch(matchId, {
          state: "finished",
          winnerId: gameResult.winnerId,
          finishedAt: new Date(),
          gameData: JSON.stringify(gameResult.gameState)
        });

        // Update user stats and balance for both players
        if (match.player1Id) await updateUserAfterGame(gameResult.winnerId === match.player1Id, match.stake, match.player1Id);
        if (match.player2Id) await updateUserAfterGame(gameResult.winnerId === match.player2Id, match.stake, match.player2Id);

        broadcastToMatch(matchId, {
          type: 'game_result',
          result: gameResult.winnerId === playerId ? 'win' : 
                  gameResult.winnerId ? 'lose' : 'draw',
          gameState: gameResult.gameState,
          winnerId: gameResult.winnerId
        });
      } else {
        broadcastToMatch(matchId, {
          type: 'game_update',
          gameState: gameResult.gameState
        });
      }
    } catch (error) {
      console.error('Game move error:', error);
    }
  }

  function broadcastToMatch(matchId: string, message: WSMessage) {
    for (const [userId, userMatchId] of userMatches.entries()) {
      if (userMatchId === matchId) {
        const client = connectedClients.get(userId);
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      }
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

  async function processGameMove(match: any, move: any, allMoves: any[]) {
    const moveData = JSON.parse(move.moveData);
    const gameType = match.gameType;
    
    switch (gameType) {
      case 'rps':
        return processRPSMove(match, moveData, allMoves);
      case 'tictactoe':
        return processTicTacToeMove(match, moveData, allMoves);
      case 'sticks':
        return processSticksMove(match, moveData, allMoves);
      case 'hangman':
        return processHangmanMove(match, moveData, allMoves);
      default:
        return { finished: false, gameState: {}, winnerId: null };
    }
  }

  function processRPSMove(match: any, moveData: any, allMoves: any[]) {
    const moves = { [guestUser.id]: moveData.move };
    
    // Simulate opponent move (simple AI)
    const rpsOptions = ['rock', 'paper', 'scissors'];
    const opponentMove = rpsOptions[Math.floor(Math.random() * 3)];
    const opponentId = match.player1Id === guestUser.id ? match.player2Id : match.player1Id;
    moves[opponentId || 'ai'] = opponentMove;
    
    const result = evaluateRPS(moveData.move, opponentMove);
    let winnerId = null;
    
    if (result === 'win') winnerId = guestUser.id;
    else if (result === 'lose') winnerId = opponentId;
    
    return {
      finished: true,
      gameState: { moves, result },
      winnerId
    };
  }

  function processTicTacToeMove(match: any, moveData: any, allMoves: any[]) {
    const board = Array(9).fill(null);
    
    // Apply all moves
    allMoves.forEach((move, index) => {
      const data = JSON.parse(move.moveData);
      board[data.position] = index % 2 === 0 ? 'X' : 'O';
    });
    
    // Add current move
    board[moveData.position] = allMoves.length % 2 === 0 ? 'X' : 'O';
    
    const winner = checkTicTacToeWinner(board);
    const finished = winner !== null || !board.includes(null);
    
    // Simple AI move if game not finished
    if (!finished) {
      const emptyCells = board.map((cell, i) => cell === null ? i : null).filter(i => i !== null);
      if (emptyCells.length > 0) {
        const aiMove = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        board[aiMove] = 'O';
      }
    }
    
    const finalWinner = checkTicTacToeWinner(board);
    
    return {
      finished: finalWinner !== null || !board.includes(null),
      gameState: { board, currentPlayer: finalWinner ? null : (allMoves.length + 1) % 2 === 0 ? 'X' : 'O' },
      winnerId: finalWinner === 'X' ? guestUser.id : finalWinner === 'O' ? match.player2Id : null
    };
  }

  function processSticksMove(match: any, moveData: any, allMoves: any[]) {
    let sticks = 21;
    
    // Apply all previous moves
    allMoves.forEach(move => {
      const data = JSON.parse(move.moveData);
      sticks -= data.take;
    });
    
    // Apply current move
    sticks -= moveData.take;
    
    if (sticks <= 0) {
      // Current player loses (took last stick)
      return {
        finished: true,
        gameState: { sticks: 0, currentPlayer: null },
        winnerId: match.player1Id === guestUser.id ? match.player2Id : match.player1Id
      };
    }
    
    // AI move
    const aiTake = Math.min(Math.max(1, Math.floor(Math.random() * 3) + 1), sticks);
    sticks -= aiTake;
    
    if (sticks <= 0) {
      // AI loses
      return {
        finished: true,
        gameState: { sticks: 0, currentPlayer: null },
        winnerId: guestUser.id
      };
    }
    
    return {
      finished: false,
      gameState: { sticks, currentPlayer: 1 },
      winnerId: null
    };
  }

  function processHangmanMove(match: any, moveData: any, allMoves: any[]) {
    const gameState = JSON.parse(match.gameData || '{}');
    const word = gameState.word || 'BLOCKCHAIN';
    const guessedLetters = [...(gameState.guessedLetters || []), moveData.letter];
    let wrongGuesses = gameState.wrongGuesses || 0;
    
    if (!word.includes(moveData.letter)) {
      wrongGuesses++;
    }
    
    const isComplete = word.split('').every(letter => guessedLetters.includes(letter));
    const failed = wrongGuesses >= 6;
    
    return {
      finished: isComplete || failed,
      gameState: { word, guessedLetters, wrongGuesses },
      winnerId: isComplete ? guestUser.id : failed ? match.player2Id : null
    };
  }

  function evaluateRPS(move1: string, move2: string) {
    if (move1 === move2) return 'draw';
    const winConditions: Record<string, string> = {
      rock: 'scissors',
      paper: 'rock',
      scissors: 'paper'
    };
    return winConditions[move1] === move2 ? 'win' : 'lose';
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

  async function updateUserAfterGame(won: boolean, stake: string) {
    const stakeAmount = parseFloat(stake);
    const currentBalance = parseFloat(guestUser.balance);
    let newBalance = currentBalance;
    let earnedAmount = "0";
    
    if (won) {
      const winnings = stakeAmount * 1.9; // 90% of double stake (10% fee)
      newBalance += winnings;
      earnedAmount = winnings.toFixed(2);
      
      await storage.createTransaction({
        userId: guestUser.id,
        type: "win",
        amount: earnedAmount,
        description: "Game victory reward"
      });
    } else {
      newBalance -= stakeAmount;
      
      await storage.createTransaction({
        userId: guestUser.id,
        type: "lose",
        amount: stake,
        description: "Game stake lost"
      });
    }
    
    guestUser = await storage.updateUserBalance(guestUser.id, newBalance.toFixed(2)) || guestUser;
    
    // Update stats
    const stats = await storage.getUserStats(guestUser.id);
    await storage.updateUserStats(guestUser.id, {
      totalGames: (stats?.totalGames || 0) + 1,
      totalWins: (stats?.totalWins || 0) + (won ? 1 : 0),
      totalLosses: (stats?.totalLosses || 0) + (won ? 0 : 1),
      totalEarned: (parseFloat(stats?.totalEarned || "0") + parseFloat(earnedAmount)).toFixed(2)
    });
  }

  return httpServer;
}
