import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Gamepad2, 
  Wallet, 
  History, 
  User, 
  Trophy, 
  X as XIcon, 
  Coins,
  TrendingUp,
  Plus,
  Minus
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import GameInterface from "@/components/GameInterface";
import StakeModal from "@/components/StakeModal";
import { useWebSocket } from "@/hooks/useWebSocket";

type Section = 'games' | 'wallet' | 'history' | 'profile';

type GameType = 'rps' | 'tictactoe' | 'sticks' | 'hangman';

interface User {
  id: string;
  username: string;
  nickname: string;
  email: string;
  balance: string;
}

interface UserStats {
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  totalEarned: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: string;
  description: string;
  createdAt: string;
}

interface GameMatch {
  id: string;
  gameType: GameType;
  stake: string;
  state: string;
}

const gameData = {
  rps: {
    title: 'Rock Paper Scissors',
    color: 'neon-green',
    description: 'Classic hand game with instant results',
    minStake: '1',
    onlineCount: '1,247'
  },
  tictactoe: {
    title: 'Tic Tac Toe',
    color: 'retro-cyan',
    description: 'Strategic grid game, think ahead',
    minStake: '2',
    onlineCount: '892'
  },
  sticks: {
    title: 'Sticks',
    color: 'retro-red',
    description: 'Mathematical strategy, last stick loses',
    minStake: '3',
    onlineCount: '456'
  },
  hangman: {
    title: 'Hangman',
    color: 'yellow-500',
    description: 'Guess the word, save the day',
    minStake: '5',
    onlineCount: '324'
  }
};

export default function GamePlatform() {
  const [currentSection, setCurrentSection] = useState<Section>('games');
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [showStakeModal, setShowStakeModal] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<GameMatch | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // WebSocket connection
  const { sendMessage, lastMessage } = useWebSocket('/ws');

  // Queries
  const { data: userData } = useQuery({
    queryKey: ['/api/user', sessionUser?.id],
    queryFn: async () => {
      const userId = sessionUser?.id;
      if (!userId) return null;
      const res = await fetch(`/api/user/${userId}`);
      return res.json();
    },
    enabled: !!sessionUser?.id
  });

  const { data: transactions } = useQuery({
    queryKey: ['/api/user/transactions', sessionUser?.id],
    queryFn: async () => {
      const userId = sessionUser?.id;
      if (!userId) return [];
      const res = await fetch(`/api/user/${userId}/transactions`);
      return res.json();
    },
    enabled: currentSection === 'history' && !!sessionUser?.id
  });

  // Mutations
  const createMatchMutation = useMutation({
    mutationFn: async ({ gameType, stake }: { gameType: GameType; stake: string }) => {
      const userId = sessionUser?.id;
      const res = await apiRequest('POST', '/api/matches', { gameType, stake, userId });
      return res.json();
    },
    onSuccess: (match) => {
      setCurrentMatch(match);
      sendMessage({ type: 'join_match', matchId: match.id });
      if (match.state === 'in_progress') {
        toast({
          title: "🎮 MATCH FOUND!",
          description: "ENTERING BATTLE MODE...",
        });
      } else {
        toast({
          title: "🔍 SEARCHING...",
          description: "SCANNING FOR OPPONENTS...",
        });
      }
    }
  });

  const createTransactionMutation = useMutation({
    mutationFn: async ({ type, amount, description }: { type: string; amount: string; description: string }) => {
      const res = await apiRequest('POST', '/api/transactions', { type, amount, description });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/transactions'] });
    }
  });

  const user = (sessionUser || userData?.user) as User | undefined;
  const stats = userData?.stats as UserStats | undefined;

  const winRate = stats && stats.totalGames > 0 
    ? Math.round((stats.totalWins / stats.totalGames) * 100) 
    : 0;

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      const message = JSON.parse(lastMessage.data);
      
      switch (message.type) {
        case 'user_session':
          setSessionUser(message.user);
          queryClient.invalidateQueries({ queryKey: ['/api/user'] });
          break;
        case 'match_found':
          setCurrentMatch(prev => prev ? { ...prev, state: 'in_progress' } : null);
          toast({
            title: "🎮 MATCH FOUND!",
            description: "Entering the digital arena...",
          });
          break;
        case 'game_result':
          const resultText = message.result === 'win' ? '🏆 VICTORY!' : 
                           message.result === 'lose' ? '💀 GAME OVER!' : '🤝 DRAW!';
          toast({
            title: resultText,
            description: message.result === 'win' ? 'CRYPTO EARNED! +1337 XP' : 
                        message.result === 'lose' ? 'BETTER LUCK NEXT TIME, PLAYER' : 'TIE GAME - STAKES RETURNED',
            variant: message.result === 'win' ? 'default' : 'destructive'
          });
          queryClient.invalidateQueries({ queryKey: ['/api/user'] });
          break;
      }
    }
  }, [lastMessage, toast, queryClient]);

  const handleGameSelect = (gameType: GameType) => {
    setSelectedGame(gameType);
    setShowStakeModal(true);
  };

  const handleStakeSelect = (stake: string) => {
    if (selectedGame) {
      createMatchMutation.mutate({ gameType: selectedGame, stake });
      setShowStakeModal(false);
    }
  };

  const handleDeposit = () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid deposit amount",
        variant: "destructive"
      });
      return;
    }

    createTransactionMutation.mutate({
      type: 'deposit',
      amount: depositAmount,
      description: 'Mock deposit transaction'
    });

    toast({
      title: "Deposit Successful",
      description: `Added ${depositAmount} USDT to your balance`,
    });

    setDepositAmount('');
  };

  const handleWithdraw = () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid withdrawal amount",
        variant: "destructive"
      });
      return;
    }

    if (!withdrawAddress) {
      toast({
        title: "Missing Address",
        description: "Please enter a wallet address",
        variant: "destructive"
      });
      return;
    }

    const balance = parseFloat(user?.balance || '0');
    if (parseFloat(withdrawAmount) > balance) {
      toast({
        title: "Insufficient Balance",
        description: "Not enough funds for this withdrawal",
        variant: "destructive"
      });
      return;
    }

    createTransactionMutation.mutate({
      type: 'withdraw',
      amount: withdrawAmount,
      description: 'Mock withdrawal transaction'
    });

    toast({
      title: "Withdrawal Initiated",
      description: `Withdrawing ${withdrawAmount} USDT to your wallet`,
    });

    setWithdrawAmount('');
    setWithdrawAddress('');
  };

  const leaveGame = () => {
    setCurrentMatch(null);
    sendMessage({ type: 'leave_match' });
  };

  if (currentMatch) {
    return (
      <GameInterface
        match={currentMatch}
        onLeave={leaveGame}
        user={user}
        sendMessage={sendMessage}
        lastMessage={lastMessage}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="bg-gradient-to-r from-retro-purple to-background border-b-2 border-neon-green p-4">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Gamepad2 className="text-neon-green text-2xl animate-float" />
            <h1 className="font-pixel text-neon-green text-xl md:text-2xl animate-glow">
              RetroGame
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            {/* Balance Display */}
            <div className="hidden md:flex items-center bg-retro-purple px-4 py-2 rounded-lg border border-neon-green/30">
              <Coins className="text-neon-green mr-2" size={16} />
              <span className="font-pixel text-sm text-neon-green">
                {parseFloat(user?.balance || '0').toFixed(2)}
              </span>
              <span className="text-gray-400 ml-1 text-xs">USDT</span>
            </div>
            {/* User Avatar */}
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-neon-green rounded-full flex items-center justify-center">
                <User className="text-retro-dark" size={16} />
              </div>
              <span className="hidden md:block font-pixel text-sm">
                {user?.nickname || 'Player1337'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6 pb-20 md:pb-6">
        <AnimatePresence mode="wait">
          {currentSection === 'games' && (
            <motion.div
              key="games"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Welcome Section */}
              <div className="mb-8">
                <div className="text-center mb-6">
                  <h2 className="font-pixel text-2xl md:text-3xl text-neon-green mb-2 animate-glow">
                    Welcome to the Arcade
                  </h2>
                  <p className="text-gray-300">Choose your game and start earning crypto rewards!</p>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <Card className="bg-retro-purple border-neon-green/30">
                    <CardContent className="p-4 text-center">
                      <Trophy className="text-neon-green text-xl mb-2 mx-auto" />
                      <div className="font-pixel text-sm text-neon-green">
                        {stats?.totalWins || 0}
                      </div>
                      <div className="text-xs text-gray-400">Wins</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-retro-purple border-retro-red/30">
                    <CardContent className="p-4 text-center">
                      <XIcon className="text-retro-red text-xl mb-2 mx-auto" />
                      <div className="font-pixel text-sm text-retro-red">
                        {stats?.totalLosses || 0}
                      </div>
                      <div className="text-xs text-gray-400">Losses</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-retro-purple border-retro-cyan/30">
                    <CardContent className="p-4 text-center">
                      <TrendingUp className="text-retro-cyan text-xl mb-2 mx-auto" />
                      <div className="font-pixel text-sm text-retro-cyan">{winRate}%</div>
                      <div className="text-xs text-gray-400">Win Rate</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-retro-purple border-neon-green/30">
                    <CardContent className="p-4 text-center">
                      <Coins className="text-neon-green text-xl mb-2 mx-auto" />
                      <div className="font-pixel text-sm text-neon-green">
                        +{parseFloat(stats?.totalEarned || '0').toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-400">Total Earned</div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Game Selection Grid */}
              <div className="mb-8">
                <h3 className="font-pixel text-xl text-neon-green mb-6 text-center">
                  Choose Your Game
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {Object.entries(gameData).map(([gameType, data]) => (
                    <motion.div
                      key={gameType}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Card 
                        className={`bg-gradient-to-br from-retro-purple to-background border-2 border-${data.color}/50 hover:border-${data.color} hover:shadow-lg hover:shadow-${data.color}/20 transition-all duration-300 cursor-pointer`}
                        onClick={() => handleGameSelect(gameType as GameType)}
                      >
                        <CardContent className="p-6 text-center">
                          <div className="mb-4">
                            <div className="w-full  bg-retro-dark rounded-lg mb-4 flex items-center justify-center">
                              <Gamepad2 className={`text-${data.color} text-4xl`} />
                            </div>
                          </div>
                          <h4 className={`font-pixel text-${data.color} text-sm mb-2`}>
                            {data.title}
                          </h4>
                          
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-400">
                              Online: <span className={`text-${data.color}`}>{data.onlineCount}</span>
                            </span>
                            {/*    <span className="text-gray-400">
                              Min: <span className={`text-${data.color}`}>{data.minStake} USDT</span>
                            </span>*/}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {currentSection === 'wallet' && (
            <motion.div
              key="wallet"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-2xl mx-auto"
            >
              <h3 className="font-pixel text-xl text-neon-green mb-6 text-center">
                Crypto Wallet
              </h3>
              
              {/* Wallet Balance */}
              <Card className="bg-retro-purple border-2 border-neon-green mb-6">
                <CardContent className="p-6 text-center">
                  <Wallet className="text-neon-green text-4xl mb-4 mx-auto" />
                  <div className="font-pixel text-3xl text-neon-green mb-2">
                    {parseFloat(user?.balance || '0').toFixed(2)}
                  </div>
                  <div className="text-gray-400">USDT Balance</div>
                  <div className="text-sm text-gray-400 mt-2">
                    Wallet Address: <span className="text-neon-green font-mono">0x1234...abcd</span>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Deposit Card */}
                <Card className="bg-retro-purple border-neon-green/30">
                  <CardContent className="p-6">
                    <h4 className="font-pixel text-neon-green mb-4 text-center">Deposit Funds</h4>
                    <div className="space-y-4">
                      <Input
                        type="number"
                        placeholder="Amount (USDT)"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        className="bg-retro-dark border-neon-green/30 focus:border-neon-green"
                      />
                      <Button
                        onClick={handleDeposit}
                        className="w-full bg-neon-green hover:bg-green-500 text-retro-dark font-pixel"
                        disabled={createTransactionMutation.isPending}
                      >
                        <Plus className="mr-2" size={16} />
                        Deposit Now
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Withdraw Card */}
                <Card className="bg-retro-purple border-retro-red/30">
                  <CardContent className="p-6">
                    <h4 className="font-pixel text-retro-red mb-4 text-center">Withdraw Funds</h4>
                    <div className="space-y-4">
                      <Input
                        type="number"
                        placeholder="Amount (USDT)"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="bg-retro-dark border-retro-red/30 focus:border-retro-red"
                      />
                      <Input
                        type="text"
                        placeholder="Wallet Address"
                        value={withdrawAddress}
                        onChange={(e) => setWithdrawAddress(e.target.value)}
                        className="bg-retro-dark border-retro-red/30 focus:border-retro-red"
                      />
                      <Button
                        onClick={handleWithdraw}
                        className="w-full bg-retro-red hover:bg-red-600 text-white font-pixel"
                        disabled={createTransactionMutation.isPending}
                      >
                        <Minus className="mr-2" size={16} />
                        Withdraw
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Supported Cryptocurrencies */}
              <Card className="bg-retro-purple border-neon-green/30">
                <CardContent className="p-6">
                  <h4 className="font-pixel text-neon-green mb-4">Supported Currencies</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {['BTC', 'ETH', 'USDT', 'BNB'].map((crypto) => (
                      <div key={crypto} className="flex items-center space-x-2 bg-retro-dark rounded-lg p-3">
                        <div className="w-6 h-6 bg-neon-green rounded-full flex items-center justify-center">
                          <span className="text-retro-dark text-xs font-bold">{crypto[0]}</span>
                        </div>
                        <span className="text-sm">{crypto}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentSection === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h3 className="font-pixel text-xl text-neon-green mb-6 text-center">
                Transaction History
              </h3>
              <div className="space-y-4 max-w-2xl mx-auto">
                {transactions && transactions.length > 0 ? (
                  transactions.map((tx: Transaction) => (
                    <Card key={tx.id} className="bg-retro-purple border-neon-green/30">
                      <CardContent className="p-4 flex justify-between items-center">
                        <div className="flex items-center space-x-3">
                          {tx.type === 'win' && <Trophy className="text-neon-green" />}
                          {tx.type === 'lose' && <XIcon className="text-retro-red" />}
                          {tx.type === 'deposit' && <Plus className="text-retro-cyan" />}
                          {tx.type === 'withdraw' && <Minus className="text-retro-red" />}
                          <div>
                            <div className={`font-pixel text-sm ${
                              tx.type === 'win' ? 'text-neon-green' :
                              tx.type === 'lose' ? 'text-retro-red' :
                              tx.type === 'deposit' ? 'text-retro-cyan' : 'text-retro-red'
                            }`}>
                              {tx.description}
                            </div>
                            <div className="text-xs text-gray-400">
                              {new Date(tx.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-pixel text-sm ${
                            tx.type === 'win' || tx.type === 'deposit' ? 'text-neon-green' : 'text-retro-red'
                          }`}>
                            {tx.type === 'win' || tx.type === 'deposit' ? '+' : '-'}{tx.amount} USDT
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="bg-retro-purple border-neon-green/30">
                    <CardContent className="p-8 text-center">
                      <History className="text-gray-400 text-4xl mb-4 mx-auto" />
                      <p className="text-gray-400">No transactions yet</p>
                      <p className="text-sm text-gray-500 mt-2">Start playing games to see your history!</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </motion.div>
          )}

          {currentSection === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-2xl mx-auto"
            >
              <h3 className="font-pixel text-xl text-neon-green mb-6 text-center">
                Player Profile
              </h3>
              
              {/* Profile Info */}
              <Card className="bg-retro-purple border-2 border-neon-green mb-6">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4 mb-6">
                    <div className="w-16 h-16 bg-neon-green rounded-full flex items-center justify-center">
                      <User className="text-retro-dark text-2xl" />
                    </div>
                    <div>
                      <h4 className="font-pixel text-lg text-neon-green">
                        {user?.nickname || 'Player1337'}
                      </h4>
                      <p className="text-gray-400">{user?.email || 'guest@retrogame.com'}</p>
                      <p className="text-xs text-gray-500">Member since Jan 2024</p>
                    </div>
                  </div>

                  {/* Balance Display */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-retro-dark border border-neon-green/30 rounded-lg p-4 text-center">
                      <div className="font-pixel text-lg text-neon-green">
                        {parseFloat(user?.balance || '0').toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-400">Available Balance</div>
                    </div>
                    <div className="bg-retro-dark border border-retro-cyan/30 rounded-lg p-4 text-center">
                      <div className="font-pixel text-lg text-retro-cyan">0.00</div>
                      <div className="text-xs text-gray-400">In Play</div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      onClick={() => setCurrentSection('wallet')}
                      className="bg-neon-green hover:bg-green-500 text-retro-dark font-pixel"
                    >
                      <Plus className="mr-2" size={16} />
                      Deposit
                    </Button>
                    <Button
                      onClick={() => setCurrentSection('wallet')}
                      className="bg-retro-red hover:bg-red-600 text-white font-pixel"
                    >
                      <Minus className="mr-2" size={16} />
                      Withdraw
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Achievement Badges */}
              <Card className="bg-retro-purple border-neon-green/30">
                <CardContent className="p-6">
                  <h4 className="font-pixel text-neon-green mb-4">Achievements</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-neon-green rounded-full flex items-center justify-center mx-auto mb-2">
                        <Trophy className="text-retro-dark" />
                      </div>
                      <div className="text-xs text-gray-400">First Win</div>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-yellow-500 rounded-full flex items-center justify-center mx-auto mb-2">
                        <TrendingUp className="text-retro-dark" />
                      </div>
                      <div className="text-xs text-gray-400">Win Streak</div>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-2">
                        <Coins className="text-white" />
                      </div>
                      <div className="text-xs text-gray-400">High Roller</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 md:relative bg-retro-purple border-t-2 border-neon-green p-4 z-50">
        <div className="flex justify-around items-center max-w-md mx-auto">
          {[
            { id: 'games', icon: Gamepad2, label: 'Games' },
            { id: 'wallet', icon: Wallet, label: 'Wallet' },
            { id: 'history', icon: History, label: 'History' },
            { id: 'profile', icon: User, label: 'Profile' },
          ].map(({ id, icon: Icon, label }) => (
            <Button
              key={id}
              variant="ghost"
              size="sm"
              className={`flex flex-col items-center space-y-1 transition-colors ${
                currentSection === id ? 'text-neon-green' : 'text-gray-400 hover:text-neon-green'
              }`}
              onClick={() => setCurrentSection(id as Section)}
            >
              <Icon size={20} />
              <span className="text-xs font-pixel">{label}</span>
            </Button>
          ))}
        </div>
      </nav>

      {/* Stake Selection Modal */}
      <StakeModal
        isOpen={showStakeModal}
        onClose={() => setShowStakeModal(false)}
        onStakeSelect={handleStakeSelect}
        gameType={selectedGame}
      />
    </div>
  );
}
