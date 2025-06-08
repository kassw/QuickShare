import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface GameBoardProps {
  gameType: string;
  gameState: any;
  serverGameState?: any;
  onMove: (move: any) => void;
  disabled: boolean;
  user?: {
    id: string;
    nickname: string;
  };
}

export default function GameBoard({ gameType, gameState, serverGameState, onMove, disabled, user }: GameBoardProps) {
  const renderRockPaperScissors = () => (
    <div className="text-center relative retro-scanlines">
      <motion.p 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-gray-400 mb-6 font-pixel text-lg animate-glow"
      >
        CHOOSE YOUR WEAPON:
      </motion.p>
      <div className="grid grid-cols-3 gap-6 max-w-md mx-auto">
        {[
          { move: 'rock', icon: '✊', label: 'ROCK', color: 'retro-red' },
          { move: 'paper', icon: '✋', label: 'PAPER', color: 'neon-green' },
          { move: 'scissors', icon: '✌️', label: 'SCISSORS', color: 'retro-cyan' }
        ].map(({ move, icon, label, color }, index) => (
          <motion.div 
            key={move} 
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ 
              scale: 1.1, 
              rotate: [0, -5, 5, 0],
              transition: { duration: 0.3 }
            }} 
            whileTap={{ scale: 0.9 }}
            className="animate-bounce-arcade"
          >
            <Button
              onClick={() => onMove({ move })}
              disabled={disabled}
              className={`arcade-border bg-retro-dark hover:bg-${color}/10 rounded-xl p-6 h-auto flex flex-col items-center space-y-2 transition-all duration-300 relative overflow-hidden group`}
              variant="outline"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-neon-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <span className="text-5xl animate-float relative z-10">{icon}</span>
              </Button>
          </motion.div>
        ))}
      </div>
      {gameState.moves && Object.keys(gameState.moves).length > 0 && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-8 p-4 bg-retro-dark rounded-lg arcade-border animate-zoom-in"
        >
          <p className="font-pixel text-neon-green mb-2 animate-glow">BATTLE RESULTS:</p>
          {Object.entries(gameState.moves).map(([playerId, move]: [string, any]) => (
            <motion.p 
              key={playerId} 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-gray-300 font-pixel text-sm animate-slide-up"
            >
              {playerId.includes('ai') ? '🤖 OPPONENT' : '👤 YOU'}: {move.toUpperCase()}
            </motion.p>
          ))}
        </motion.div>
      )}
    </div>
  );

  // Use server game state if available, otherwise fall back to local game state
  const currentGameState = serverGameState || gameState;
  const isYourTurn = currentGameState.currentPlayer === user?.id || currentGameState.isYourTurn?.(user?.id);

  const renderTicTacToe = () => (
    <div className="text-center relative retro-scanlines">
      <motion.p 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-gray-400 mb-6 font-pixel text-lg animate-glow"
      >
        {currentGameState.currentPlayer ? (isYourTurn ? "YOUR TURN" : "OPPONENT'S TURN") : "GAME OVER"}
      </motion.p>
      <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
        {currentGameState.board?.map((cell: string | null, index: number) => (
          <motion.div 
            key={index} 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.05 }} 
            whileTap={{ scale: 0.95 }}
          >
            <Button
              onClick={() => onMove({ position: index })}
              disabled={disabled || currentGameState.board?.[index] !== null || !isYourTurn}
              className={`arcade-border bg-retro-dark w-20 h-20 text-2xl font-pixel transition-all duration-300 ${
                currentGameState.board?.[index] === 'X' ? 'text-neon-green' : 'text-retro-cyan'
              }`}
              variant="outline"
            >
              {currentGameState.board?.[index] || ''}
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderSticks = () => (
    <div className="text-center relative retro-scanlines">
      <motion.p 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-gray-400 mb-6 font-pixel text-lg animate-glow"
      >
        {currentGameState.currentPlayer ? (isYourTurn ? "YOUR TURN" : "OPPONENT'S TURN") : "GAME OVER"}
      </motion.p>
      <div className="mb-6">
        <motion.div 
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="font-pixel text-2xl text-neon-green mb-4 animate-glow"
        >
          STICKS REMAINING: {currentGameState.sticks || 21}
        </motion.div>
        <div className="flex justify-center space-x-1 mb-6 flex-wrap">
          {Array(Math.max(0, currentGameState.sticks || 21)).fill(null).map((_, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 64 }}
              transition={{ delay: i * 0.02 }}
              className="w-2 h-16 bg-neon-green animate-float"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      </div>
      <div className="space-x-4">
        {[1, 2, 3].map((take) => (
          <motion.div 
            key={take} 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: take * 0.1 }}
            whileHover={{ scale: 1.05 }} 
            whileTap={{ scale: 0.95 }} 
            className="inline-block"
          >
            <Button
              onClick={() => onMove({ take })}
              disabled={disabled || take > (currentGameState.sticks || 21) || !isYourTurn}
              className="arcade-border bg-retro-dark px-6 py-3 font-pixel transition-all duration-300 hover:bg-neon-green/10"
              variant="outline"
            >
              TAKE {take}
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderHangman = () => {
    const word = currentGameState.word || 'BLOCKCHAIN';
    const guessedLetters = currentGameState.guessedLetters || [];
    const wrongGuesses = currentGameState.wrongGuesses || 0;
    const displayWord = currentGameState.displayWord || word.split('').map((letter: any) => 
      guessedLetters.includes(letter) ? letter : '_'
    ).join(' ');

    return (
      <div className="text-center relative retro-scanlines">
        <motion.p 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-gray-400 mb-4 font-pixel text-lg animate-glow"
        >
          {currentGameState.currentPlayer ? (isYourTurn ? "YOUR TURN" : "OPPONENT'S TURN") : 
           (currentGameState.won ? "WORD GUESSED!" : currentGameState.lost ? "GAME OVER" : "GAME OVER")}
        </motion.p>

        <motion.div 
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="text-retro-cyan mb-4 font-pixel animate-glow"
        >
          WRONG GUESSES: {wrongGuesses}/6
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="font-pixel text-3xl text-neon-green mb-8 tracking-wider animate-glow"
        >
          {displayWord}
        </motion.div>

        {currentGameState.gameOver && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-pixel text-xl text-retro-cyan mb-4"
          >
            THE WORD WAS: {word}
          </motion.div>
        )}

        <div className="grid grid-cols-6 gap-2 max-w-md mx-auto mb-6">
          {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter: any) => {
            const isGuessed = guessedLetters.includes(letter);
            const isInWord = word.toUpperCase().includes(letter);

            return (
              <motion.div 
                key={letter} 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: letter.charCodeAt(0) * 0.01 }}
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  onClick={() => onMove({ letter })}
                  disabled={disabled || isGuessed || !isYourTurn || currentGameState.gameOver}
                  className={`arcade-border p-2 font-pixel text-sm transition-all duration-300 ${
                    isGuessed 
                      ? isInWord 
                        ? 'bg-neon-green/20 text-neon-green border-neon-green' 
                        : 'bg-red-500/20 text-red-400 border-red-500'
                      : 'bg-retro-dark hover:bg-neon-green/10'
                  }`}
                  variant="outline"
                >
                  {letter}
                </Button>
              </motion.div>
            );
          })}
        </div>
        {currentGameState.guessedLetters && currentGameState.guessedLetters.length > 0 && (
            <div className="text-xs text-gray-400">
              Guessed: {currentGameState.guessedLetters.join(', ')}
            </div>
          )}
      </div>
    );
  };

  switch (gameType) {
    case 'rps':
      return renderRockPaperScissors();
    case 'tictactoe':
      return renderTicTacToe();
    case 'sticks':
      return renderSticks();
    case 'hangman':
      return renderHangman();
    default:
      return <div className="text-center text-gray-400">Unknown game type</div>;
  }
}