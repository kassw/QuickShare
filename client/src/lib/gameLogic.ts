export function initializeGameState(gameType: string) {
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

export function processMove(currentState: any, move: any, gameType: string) {
  switch (gameType) {
    case 'rps':
      return {
        ...currentState,
        moves: { ...currentState.moves, player: move.move }
      };
      
    case 'tictactoe':
      const newBoard = [...currentState.board];
      newBoard[move.position] = currentState.currentPlayer;
      return {
        ...currentState,
        board: newBoard,
        currentPlayer: currentState.currentPlayer === 'X' ? 'O' : 'X'
      };
      
    case 'sticks':
      return {
        ...currentState,
        sticks: Math.max(0, currentState.sticks - move.take),
        currentPlayer: currentState.currentPlayer === 1 ? 2 : 1
      };
      
    case 'hangman':
      const newGuessedLetters = [...currentState.guessedLetters, move.letter];
      let newWrongGuesses = currentState.wrongGuesses;
      
      if (!currentState.word.includes(move.letter)) {
        newWrongGuesses++;
      }
      
      return {
        ...currentState,
        guessedLetters: newGuessedLetters,
        wrongGuesses: newWrongGuesses
      };
      
    default:
      return currentState;
  }
}

export function checkGameFinished(gameState: any, gameType: string): boolean {
  switch (gameType) {
    case 'rps':
      return Object.keys(gameState.moves).length >= 2;
      
    case 'tictactoe':
      return checkTicTacToeWinner(gameState.board) !== null || 
             !gameState.board.includes(null);
             
    case 'sticks':
      return gameState.sticks <= 0;
      
    case 'hangman':
      const isComplete = gameState.word.split('').every((letter: string) => 
        gameState.guessedLetters.includes(letter));
      return isComplete || gameState.wrongGuesses >= 6;
      
    default:
      return false;
  }
}

function checkTicTacToeWinner(board: (string | null)[]): string | null {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6] // diagonals
  ];
  
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  
  return null;
}
