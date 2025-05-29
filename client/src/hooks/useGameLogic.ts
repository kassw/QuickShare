import { useState } from 'react';
import { initializeGameState, processMove, checkGameFinished } from '@/lib/gameLogic';

export function useGameLogic(gameType: string) {
  const [gameState, setGameState] = useState(() => initializeGameState(gameType));

  const makeMove = (move: any) => {
    const newState = processMove(gameState, move, gameType);
    setGameState(newState);
  };

  const resetGame = () => {
    setGameState(initializeGameState(gameType));
  };

  const isGameFinished = checkGameFinished(gameState, gameType);

  return {
    gameState,
    makeMove,
    resetGame,
    isGameFinished
  };
}
