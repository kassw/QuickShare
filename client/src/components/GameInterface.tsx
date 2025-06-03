import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import GameBoard from "./GameBoard";
import { useGameLogic } from "@/hooks/useGameLogic";

interface GameInterfaceProps {
  match: {
    id: string;
    gameType: string;
    stake: string;
    state: string;
  };
  onLeave: () => void;
  user?: {
    id: string;
    nickname: string;
  };
  sendMessage: (message: any) => void;
  lastMessage: MessageEvent | null;
}

export default function GameInterface({ 
  match, 
  onLeave, 
  user, 
  sendMessage,
  lastMessage 
}: GameInterfaceProps) {
  const [gameStatus, setGameStatus] = useState("Finding opponent...");
  const [showPlayAgain, setShowPlayAgain] = useState(false);
  
  const {
    gameState,
    makeMove,
    resetGame,
    isGameFinished
  } = useGameLogic(match.gameType);

  useEffect(() => {
    if (match.state === 'waiting') {
      setGameStatus("Finding opponent...");
    } else if (match.state === 'in_progress') {
      setGameStatus("Your turn");
    }
  }, [match.state]);

  useEffect(() => {
    if (lastMessage) {
      const message = JSON.parse(lastMessage.data);
      
      switch (message.type) {
        case 'match_found':
          setGameStatus("Opponent found! Game starting...");
          setTimeout(() => {
            setGameStatus("Your turn");
          }, 1500);
          break;
        case 'game_update':
          setGameStatus("Opponent's turn");
          break;
        case 'game_result':
          const resultText = message.result === 'win' ? '🎉 You Won!' : 
                           message.result === 'lose' ? '💀 You Lost!' : '🤝 Draw!';
          setGameStatus(resultText);
          setShowPlayAgain(true);
          break;
      }
    }
  }, [lastMessage]);

  const handleMove = (move: any) => {
    makeMove(move);
    sendMessage({
      type: 'make_move',
      matchId: match.id,
      move
    });
    setGameStatus("⚡ TRANSMITTING MOVE...");
  };

  const handlePlayAgain = () => {
    resetGame();
    setShowPlayAgain(false);
    setGameStatus("Finding opponent...");
    // Create new match with same parameters
    // This would trigger the parent component to create a new match
  };

  const getGameTitle = () => {
    switch (match.gameType) {
      case 'rps': return 'Rock Paper Scissors';
      case 'tictactoe': return 'Tic Tac Toe';
      case 'sticks': return 'Sticks';
      case 'hangman': return 'Hangman';
      default: return 'Game';
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4">
      <Card className="bg-retro-purple border-2 border-neon-green max-w-4xl mx-auto">
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-pixel text-xl text-neon-green">
              {getGameTitle()}
            </h3>
            <Button
              onClick={onLeave}
              variant="destructive"
              size="sm"
              className="font-pixel text-xs"
            >
              <ArrowLeft className="mr-2" size={16} />
              Leave Game
            </Button>
          </div>

          {/* Game Status */}
          <div className="text-center mb-6">
            <motion.div 
              key={gameStatus}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="font-pixel text-lg text-neon-green mb-2"
            >
              {gameStatus}
            </motion.div>
            <div className="text-sm text-gray-400">
              Stake: <span className="text-neon-green font-pixel">{match.stake} USDT</span>
            </div>
          </div>

          {/* Game Board */}
          <div className="min-h-96 flex items-center justify-center">
            <GameBoard
              gameType={match.gameType}
              gameState={gameState}
              onMove={handleMove}
              disabled={match.state !== 'in_progress' || isGameFinished}
            />
          </div>

          {/* Play Again / Back to Games */}
          {showPlayAgain && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mt-8 space-x-4"
            >
              <Button
                onClick={handlePlayAgain}
                className="bg-neon-green hover:bg-green-500 text-retro-dark font-pixel"
              >
                Play Again
              </Button>
              <Button
                onClick={onLeave}
                variant="destructive"
                className="font-pixel"
              >
                Back to Games
              </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
