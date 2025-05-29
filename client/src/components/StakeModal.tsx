import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface StakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStakeSelect: (stake: string) => void;
  gameType: string | null;
}

const stakeOptions = [
  { amount: '1', label: 'Beginner' },
  { amount: '5', label: 'Popular' },
  { amount: '10', label: 'Advanced' },
  { amount: '25', label: 'High Roller' },
];

export default function StakeModal({ isOpen, onClose, onStakeSelect, gameType }: StakeModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="bg-retro-purple border-2 border-neon-green max-w-md w-full mx-4">
            <CardContent className="p-6">
              <h3 className="font-pixel text-xl text-neon-green mb-4 text-center">
                Select Your Stake
              </h3>
              <div className="space-y-4 mb-6">
                {stakeOptions.map((option) => (
                  <motion.div
                    key={option.amount}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      onClick={() => onStakeSelect(option.amount)}
                      className="w-full bg-retro-dark border border-neon-green/30 hover:border-neon-green rounded-lg p-4 text-left transition-colors justify-between"
                      variant="outline"
                    >
                      <span className="font-pixel text-neon-green">{option.amount} USDT</span>
                      <span className="text-sm text-gray-400">{option.label}</span>
                    </Button>
                  </motion.div>
                ))}
              </div>
              <Button
                onClick={onClose}
                variant="destructive"
                className="w-full font-pixel"
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
