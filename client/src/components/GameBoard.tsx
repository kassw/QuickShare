import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface GameBoardProps {
  gameType: string;
  gameState: any;
  onMove: (move: any) => void;
  disabled: boolean;
}

export default function GameBoard({ gameType, gameState, onMove, disabled }: GameBoardProps) {
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
              <span className={`font-pixel text-sm text-${color} relative z-10 animate-glow`}>{label}</span>
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

  const renderTicTacToe = () => (
    <div className="text-center">
      <p className="text-gray-400 mb-6">You are X, opponent is O</p>
      <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
        {Array(9).fill(null).map((_, index) => (
          <motion.div key={index} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              onClick={() => onMove({ position: index })}
              disabled={disabled || gameState.board?.[index] !== null}
              className="bg-retro-dark border-2 border-neon-green/30 hover:border-neon-green w-20 h-20 text-2xl font-pixel transition-all duration-300"
              variant="outline"
            >
              {gameState.board?.[index] || ''}
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderSticks = () => (
    <div className="text-center">
      <p className="text-gray-400 mb-6">Take 1-3 sticks. Last stick loses!</p>
      <div className="mb-6">
        <div className="font-pixel text-2xl text-neon-green mb-4">
          Sticks remaining: {gameState.sticks || 21}
        </div>
        <div className="flex justify-center space-x-1 mb-6 flex-wrap">
          {Array(Math.max(0, gameState.sticks || 21)).fill(null).map((_, i) => (
            <div key={i} className="w-1 h-16 bg-neon-green"></div>
          ))}
        </div>
      </div>
      <div className="space-x-4">
        {[1, 2, 3].map((take) => (
          <motion.div key={take} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="inline-block">
            <Button
              onClick={() => onMove({ take })}
              disabled={disabled || take > (gameState.sticks || 21)}
              className="bg-retro-dark border-2 border-neon-green/30 hover:border-neon-green px-6 py-3 font-pixel transition-all duration-300"
              variant="outline"
            >
              Take {take}
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderHangman = () => {
    const word = gameState.word || 'BLOCKCHAIN';
    const guessedLetters = gameState.guessedLetters || [];
    const wrongGuesses = gameState.wrongGuesses || 0;
    const displayWord = word.split('').map(letter => 
      guessedLetters.includes(letter) ? letter : '_'
    ).join(' ');

    return (
      <div className="text-center">
        <p className="text-gray-400 mb-6">Wrong guesses: {wrongGuesses}/6</p>
        <div className="font-pixel text-3xl text-neon-green mb-8 tracking-wider">
          {displayWord}
        </div>
        <div className="grid grid-cols-6 gap-2 max-w-md mx-auto mb-6">
          {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => (
            <motion.div key={letter} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                onClick={() => onMove({ letter })}
                disabled={disabled || guessedLetters.includes(letter)}
                className={`bg-retro-dark border-2 border-neon-green/30 hover:border-neon-green p-2 font-pixel text-sm transition-all duration-300 ${
                  guessedLetters.includes(letter) ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                variant="outline"
              >
                {letter}
              </Button>
            </motion.div>
          ))}
        </div>
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
