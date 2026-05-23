import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User, Transaction, Investment, Trade, CopyTrader, InvestmentPlan, MarketAsset, TransactionStatus } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  updateDoc, 
  collection, 
  onSnapshot, 
  getDoc,
  getDocFromServer
} from 'firebase/firestore';

interface DashboardContextType {
  user: User | null;
  transactions: Transaction[];
  investments: Investment[];
  trades: Trade[];
  copyTraders: CopyTrader[];
  marketAssets: MarketAsset[];
  investmentPlans: InvestmentPlan[];
  login: (email: string, password?: string) => Promise<any>;
  register: (email: string, password?: string, name?: string) => Promise<any>;
  logout: () => void;
  deposit: (amount: number, method: string, details: string) => void;
  withdraw: (amount: number, method: string, details: string) => Promise<{ success: boolean; message: string }>;
  invest: (planId: string, amount: number) => Promise<{ success: boolean; message: string }>;
  claimInvestment: (investmentId: string) => void;
  openTrade: (symbol: string, type: 'buy' | 'sell', amount: number, leverage: number) => Promise<{ success: boolean; message: string }>;
  closeTrade: (tradeId: string) => void;
  toggleCopyTrader: (traderId: string, amount: number) => Promise<{ success: boolean; message: string }>;
  adminUpdateUser: (fields: Partial<User>) => void;
  adminApproveTransaction: (txId: string) => void;
  adminRejectTransaction: (txId: string) => void;
  triggerMarketTick: () => void;
  verifyAccount: () => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

const INITIAL_PLANS: InvestmentPlan[] = [
  {
    id: 'beginner',
    name: 'Beginner Plan',
    min: 100,
    max: 1499,
    dailyRoi: 1.5,
    durationDays: 7,
    description: 'Perfect for trading novices starting their CFD and crypto journey.',
    features: ['1.5% Daily Interest Payout', 'Duration: 7 Days', '24/7 Priority Support', 'Basic Market Signals', 'Direct Crypto/Wire Deposits']
  },
  {
    id: 'basic',
    name: 'Basic Plan',
    min: 1500,
    max: 4999,
    dailyRoi: 2.5,
    durationDays: 14,
    description: 'Ideal plan for growing your portfolio with consistent daily rewards.',
    features: ['2.5% Daily Interest Payout', 'Duration: 14 Days', 'Personal Technical Analyst Access', 'Standard Trading Signals', 'Risk-free Trial Tools']
  },
  {
    id: 'standard',
    name: 'Standard Plan',
    min: 5000,
    max: 19999,
    dailyRoi: 3.5,
    durationDays: 30,
    description: 'Our most popular high-yield trading and copy-matching plan.',
    features: ['3.5% Daily Interest Payout', 'Duration: 30 Days', 'Dedicated Wealth Manager', 'Advanced Trading Dashboard', 'Copy-Match Professional Strategies']
  },
  {
    id: 'business',
    name: 'Business Plan',
    min: 20000,
    max: 250000,
    dailyRoi: 5.0,
    durationDays: 60,
    description: 'For corporate institutions and veteran high-volume investors.',
    features: ['5.0% Daily Interest Payout', 'Duration: 60 Days', 'Executive Financial Consultant', 'Premium Grounding Analytics', 'Custom OTC Execution Station']
  }
];

const INITIAL_ASSETS: MarketAsset[] = [
  { symbol: 'BTC/USD', name: 'Bitcoin', category: 'crypto', price: 92450.75, change24h: 3.42, history24h: [91000, 91400, 91200, 91800, 92100, 92450] },
  { symbol: 'ETH/USD', name: 'Ethereum', category: 'crypto', price: 3480.95, change24h: -1.25, history24h: [3530, 3510, 3490, 3470, 3460, 3480.95] },
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', category: 'forex', price: 1.0845, change24h: 0.12, history24h: [1.0820, 1.0830, 1.0825, 1.0840, 1.0845] },
  { symbol: 'GBP/USD', name: 'Pound / US Dollar', category: 'forex', price: 1.2678, change24h: 0.45, history24h: [1.2610, 1.2630, 1.2640, 1.2660, 1.2678] },
  { symbol: 'AAPL', name: 'Apple Inc.', category: 'stock', price: 182.45, change24h: -0.80, history24h: [184.20, 183.50, 182.10, 181.90, 182.45] },
  { symbol: 'XAU/USD', name: 'Gold Spot', category: 'commodity', price: 2342.15, change24h: 1.95, history24h: [2310, 2320, 2315, 2330, 2342.15] }
];

const INITIAL_TRADERS: CopyTrader[] = [
  { id: 't1', name: 'Marcus Sterling', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', winRate: 88, roi30D: 42.5, aum: 1450000, riskScore: 3, copiers: 1240, preferredAsset: 'BTC/USD' },
  { id: 't2', name: 'Elena Rostova', avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150', winRate: 94, roi30D: 68.2, aum: 2890000, riskScore: 4, copiers: 2850, preferredAsset: 'EUR/USD' },
  { id: 't3', name: 'Devon Keanu', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', winRate: 81, roi30D: 29.8, aum: 980000, riskScore: 2, copiers: 860, preferredAsset: 'XAU/USD' }
];

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [copyTraders, setCopyTraders] = useState<CopyTrader[]>(() => {
    const saved = localStorage.getItem('py_copy_traders');
    return saved ? JSON.parse(saved) : INITIAL_TRADERS;
  });
  const [marketAssets, setMarketAssets] = useState<MarketAsset[]>(() => {
    const saved = localStorage.getItem('py_market_assets');
    return saved ? JSON.parse(saved) : INITIAL_ASSETS;
  });

  // Keep references for stable ticking interval callbacks
  const stateRef = useRef({ user, investments, trades, marketAssets, copyTraders });
  stateRef.current = { user, investments, trades, marketAssets, copyTraders };

  // Connection validation at startup (Firebase SKILL requirement)
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Sync state to LocalStorage for offline-first backup UI components
  useEffect(() => {
    localStorage.setItem('py_copy_traders', JSON.stringify(copyTraders));
  }, [copyTraders]);

  useEffect(() => {
    localStorage.setItem('py_market_assets', JSON.stringify(marketAssets));
  }, [marketAssets]);

  // Synchronous listeners list to cleanly dispose of on logout / auth states transitions
  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    let unsubTransactions: (() => void) | null = null;
    let unsubInvestments: (() => void) | null = null;
    let unsubTrades: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean previous listeners
      if (unsubUser) { unsubUser(); unsubUser = null; }
      if (unsubTransactions) { unsubTransactions(); unsubTransactions = null; }
      if (unsubInvestments) { unsubInvestments(); unsubInvestments = null; }
      if (unsubTrades) { unsubTrades(); unsubTrades = null; }

      if (firebaseUser) {
        const uid = firebaseUser.uid;
        
        // Subscribe to user doc
        unsubUser = onSnapshot(doc(db, 'users', uid), async (snapshot) => {
          if (snapshot.exists()) {
            setUser(snapshot.data() as User);
          } else {
            // Self-healing: if auth details exist but user document isn't populated, create/initialize user document
            const defaultUser: User = {
              id: uid,
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Member',
              email: firebaseUser.email || '',
              balance: 15450.50, // Match default first logins
              profits: 1245.80,
              totalWithdrawn: 2500.00,
              activeInvestmentsAmount: 2000.00,
              referralsEarned: 350.00,
              referralCode: 'PY-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
              verificationStatus: 'verified',
              joinedAt: new Date().toISOString()
            };
            try {
              await setDoc(doc(db, 'users', uid), defaultUser);
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
            }
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${uid}`);
        });

        // Subscribe to transactions
        unsubTransactions = onSnapshot(collection(db, 'users', uid, 'transactions'), (snapshot) => {
          const list: Transaction[] = [];
          snapshot.forEach(docSnap => {
            list.push(docSnap.data() as Transaction);
          });
          list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setTransactions(list);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${uid}/transactions`);
        });

        // Subscribe to investments
        unsubInvestments = onSnapshot(collection(db, 'users', uid, 'investments'), (snapshot) => {
          const list: Investment[] = [];
          snapshot.forEach(docSnap => {
            list.push(docSnap.data() as Investment);
          });
          setInvestments(list);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${uid}/investments`);
        });

        // Subscribe to trades
        unsubTrades = onSnapshot(collection(db, 'users', uid, 'trades'), (snapshot) => {
          const list: Trade[] = [];
          snapshot.forEach(docSnap => {
            list.push(docSnap.data() as Trade);
          });
          setTrades(list);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${uid}/trades`);
        });

      } else {
        // Logged out state
        setUser(null);
        setTransactions([]);
        setInvestments([]);
        setTrades([]);
        setCopyTraders(INITIAL_TRADERS);
      }
    });

    return () => {
      unsubAuth();
      if (unsubUser) unsubUser();
      if (unsubTransactions) unsubTransactions();
      if (unsubInvestments) unsubInvestments();
      if (unsubTrades) unsubTrades();
    };
  }, []);

  // Auth Functions
  const login = async (email: string, password?: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password || 'demotrader123');
      return { success: true };
    } catch (error: any) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const register = async (email: string, password?: string, name?: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password || 'demotrader123');
      const uid = userCredential.user.uid;
      const formattedName = (name || email.split('@')[0]).trim();
      const newUser: User = {
        id: uid,
        name: formattedName.charAt(0).toUpperCase() + formattedName.slice(1),
        email: email.trim().toLowerCase(),
        balance: 1000.00, // Gift a trial $1000 balance to registration! Great UX!
        profits: 0,
        totalWithdrawn: 0,
        activeInvestmentsAmount: 0,
        referralsEarned: 0,
        referralCode: 'PY-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
        verificationStatus: 'unverified',
        joinedAt: new Date().toISOString()
      };
      
      // Write profile to user doc
      await setDoc(doc(db, 'users', uid), newUser);

      setTransactions(prev => [
        {
          id: 'tx_welcome',
          type: 'deposit',
          amount: 1000.00,
          method: 'Registration Bonus',
          timestamp: new Date().toISOString(),
          status: 'completed',
          details: 'Welcome to coinvest credit grant!'
        },
        ...prev
      ]);

      // Initial Deposit transaction written to subcollection
      const initTx: Transaction = {
        id: 'tx_welcome',
        type: 'deposit',
        amount: 1000.00,
        method: 'Registration Bonus',
        timestamp: new Date().toISOString(),
        status: 'completed',
        details: 'Welcome to coinvest credit grant!'
      };

      await setDoc(doc(db, 'users', uid, 'transactions', 'tx_welcome'), initTx);
      return { success: true };
    } catch (error: any) {
      console.error("Registration failed:", error);
      throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  // Verification
  const verifyAccount = async () => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.id), { verificationStatus: 'pending' });
    
    // Simulate automated compliance check which approves after 20 seconds!
    setTimeout(async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', user.id));
        if (userSnap.exists() && userSnap.data()?.verificationStatus === 'pending') {
          await updateDoc(doc(db, 'users', user.id), { verificationStatus: 'verified' });
        }
      } catch (err) {
        console.error(err);
      }
    }, 20000);
  };

  // Wallet Actions
  const deposit = async (amount: number, method: string, details: string) => {
    if (!user) return;
    const txId = 'tx_dep_' + Math.random().toString(36).substring(2, 9);
    const newTx: Transaction = {
      id: txId,
      type: 'deposit',
      amount,
      method,
      timestamp: new Date().toISOString(),
      status: 'pending',
      details,
      txHash: method.toLowerCase().includes('wire') ? undefined : '0x' + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('')
    };

    await setDoc(doc(db, 'users', user.id, 'transactions', txId), newTx);

    // Auto-approve simulated deposit after 15 seconds to give excellent user feedback!
    setTimeout(async () => {
      try {
        const txSnap = await getDoc(doc(db, 'users', user.id, 'transactions', txId));
        if (txSnap.exists() && txSnap.data()?.status === 'pending') {
          const userSnap = await getDoc(doc(db, 'users', user.id));
          if (userSnap.exists()) {
            const currentBalance = userSnap.data()?.balance || 0;
            await updateDoc(doc(db, 'users', user.id), { balance: parseFloat((currentBalance + amount).toFixed(2)) });
          }
          await updateDoc(doc(db, 'users', user.id, 'transactions', txId), { status: 'completed' });
        }
      } catch (e) {
        console.error("Auto approval error", e);
      }
    }, 15000);
  };

  const withdraw = async (amount: number, method: string, details: string) => {
    if (!user) return { success: false, message: 'Not logged in' };
    if (amount > user.balance) {
      return { success: false, message: 'Insufficient clear funds available in your account.' };
    }

    const updatedUser = {
      ...user,
      balance: parseFloat((user.balance - amount).toFixed(2)),
      totalWithdrawn: parseFloat((user.totalWithdrawn + amount).toFixed(2))
    };

    const txId = 'tx_wd_' + Math.random().toString(36).substring(2, 9);
    const newTx: Transaction = {
      id: txId,
      type: 'withdrawal',
      amount,
      method,
      timestamp: new Date().toISOString(),
      status: 'pending',
      details
    };

    await setDoc(doc(db, 'users', user.id), updatedUser);
    await setDoc(doc(db, 'users', user.id, 'transactions', txId), newTx);

    // Standard withdrawal auto-approver Simulator (30 seconds)
    setTimeout(async () => {
      try {
        const txSnap = await getDoc(doc(db, 'users', user.id, 'transactions', txId));
        if (txSnap.exists() && txSnap.data()?.status === 'pending') {
          await updateDoc(doc(db, 'users', user.id, 'transactions', txId), { status: 'completed' });
        }
      } catch (err) {
        console.error(err);
      }
    }, 30000);

    return { success: true, message: 'Withdrawal protocol initialized. Our audit desk is reviewing your ticket.' };
  };

  // Investment Allocation
  const invest = async (planId: string, amount: number) => {
    if (!user) return { success: false, message: 'Not logged in' };
    const plan = INITIAL_PLANS.find(p => p.id === planId);
    if (!plan) return { success: false, message: 'Invalid plan selected.' };

    if (amount < plan.min || amount > plan.max) {
      return { success: false, message: `Investment amount details: Minimum is $${plan.min} and Maximum is $${plan.max} for ${plan.name}.` };
    }

    if (amount > user.balance) {
      return { success: false, message: 'Insufficient core balances. Please complete a deposit request first.' };
    }

    const updatedUser = {
      ...user,
      balance: parseFloat((user.balance - amount).toFixed(2)),
      activeInvestmentsAmount: parseFloat((user.activeInvestmentsAmount + amount).toFixed(2))
    };

    const invId = 'inv_' + Math.random().toString(36).substring(2, 9);
    const newInvestment: Investment = {
      id: invId,
      planId: plan.id,
      planName: plan.name,
      amount,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000).toISOString(),
      dailyRoi: plan.dailyRoi,
      durationDays: plan.durationDays,
      status: 'active',
      totalEarned: 0,
      lastClaimDate: new Date().toISOString()
    };

    const txId = 'tx_inv_lc_' + Math.random().toString(36).substring(2, 9);
    const newTx: Transaction = {
      id: txId,
      type: 'investment',
      amount,
      method: 'Main Balance',
      timestamp: new Date().toISOString(),
      status: 'completed',
      details: `Subscribing to ${plan.name} package.`
    };

    await setDoc(doc(db, 'users', user.id), updatedUser);
    await setDoc(doc(db, 'users', user.id, 'investments', invId), newInvestment);
    await setDoc(doc(db, 'users', user.id, 'transactions', txId), newTx);

    return { success: true, message: `Successfully allocated $${amount.toLocaleString()} into the ${plan.name}!` };
  };

  const claimInvestment = async (investmentId: string) => {
    if (!user) return;
    const inv = investments.find(i => i.id === investmentId);
    if (!inv || inv.status !== 'active') return;

    const claims = inv.totalEarned;
    if (claims <= 0) return;

    const updatedUser = {
      ...user,
      balance: parseFloat((user.balance + claims).toFixed(2)),
      profits: parseFloat((user.profits + claims).toFixed(2))
    };

    const txId = 'tx_claim_' + Math.random().toString(36).substring(2, 9);
    const claimTx: Transaction = {
      id: txId,
      type: 'payout',
      amount: claims,
      method: 'Yield Settle',
      timestamp: new Date().toISOString(),
      status: 'completed',
      details: `Yield claim from ${inv.planName} contract.`
    };

    const updatedInv = {
      ...inv,
      totalEarned: 0,
      lastClaimDate: new Date().toISOString()
    };

    await setDoc(doc(db, 'users', user.id), updatedUser);
    await setDoc(doc(db, 'users', user.id, 'investments', investmentId), updatedInv);
    await setDoc(doc(db, 'users', user.id, 'transactions', txId), claimTx);
  };

  // CFD Live Trading Engine
  const openTrade = async (symbol: string, type: 'buy' | 'sell', amount: number, leverage: number) => {
    if (!user) return { success: false, message: 'Not logged in' };
    const requiredMargin = amount;
    if (requiredMargin > user.balance) {
      return { success: false, message: 'Insufficient funds for required margin.' };
    }

    const asset = marketAssets.find(a => a.symbol === symbol);
    if (!asset) return { success: false, message: 'Asset ticker unavailable.' };

    const entryPrice = asset.price;

    const updatedUser = {
      ...user,
      balance: parseFloat((user.balance - requiredMargin).toFixed(2))
    };

    const tradeId = 'tr_' + Math.random().toString(36).substring(2, 9);
    const newTrade: Trade = {
      id: tradeId,
      symbol,
      type,
      entryPrice,
      currentPrice: entryPrice,
      amount: requiredMargin,
      leverage,
      timestamp: new Date().toISOString(),
      pnl: 0,
      status: 'open'
    };

    const txId = 'tx_tr_op_' + Math.random().toString(36).substring(2, 9);
    const newTx: Transaction = {
      id: txId,
      type: 'investment',
      amount: requiredMargin,
      method: 'CFD Margin Secure',
      timestamp: new Date().toISOString(),
      status: 'completed',
      details: `Opened Position: ${type.toUpperCase()} ${symbol} @ $${entryPrice.toLocaleString()} (${leverage}x Leverage)`
    };

    await setDoc(doc(db, 'users', user.id), updatedUser);
    await setDoc(doc(db, 'users', user.id, 'trades', tradeId), newTrade);
    await setDoc(doc(db, 'users', user.id, 'transactions', txId), newTx);

    return { success: true, message: `Successfully executed position: ${type.toUpperCase()} ${symbol} with ${leverage}x leverage!` };
  };

  const closeTrade = async (tradeId: string) => {
    if (!user) return;
    const tr = trades.find(t => t.id === tradeId);
    if (!tr || tr.status !== 'open') return;

    const netReturn = tr.amount + tr.pnl;
    const updatedBalance = Math.max(0, user.balance + netReturn);
    const updatedProfit = user.profits + tr.pnl;

    const updatedUser = {
      ...user,
      balance: parseFloat(updatedBalance.toFixed(2)),
      profits: parseFloat(updatedProfit.toFixed(2))
    };

    const txId = 'tx_tr_cl_' + Math.random().toString(36).substring(2, 9);
    const closeTx: Transaction = {
      id: txId,
      type: 'payout',
      amount: Math.abs(tr.pnl),
      method: 'CFD Position Close',
      timestamp: new Date().toISOString(),
      status: 'completed',
      details: `Closed: <sup>${tr.type.toUpperCase()}</sup> ${tr.symbol} P&L: ${tr.pnl >= 0 ? '+' : '-'}$${Math.abs(tr.pnl).toLocaleString()}`
    };

    const updatedTrade = {
      ...tr,
      status: 'closed' as const,
      closedPrice: tr.currentPrice
    };

    await setDoc(doc(db, 'users', user.id), updatedUser);
    await setDoc(doc(db, 'users', user.id, 'trades', tradeId), updatedTrade);
    await setDoc(doc(db, 'users', user.id, 'transactions', txId), closeTx);
  };

  // Copy Trading
  const toggleCopyTrader = async (traderId: string, amount: number) => {
    if (!user) return { success: false, message: 'Not logged in' };
    const trader = copyTraders.find(t => t.id === traderId);
    if (!trader) return { success: false, message: 'Trader profile data mismatch.' };

    if (trader.isCopied) {
      const refund = trader.copiedAmount || 0;
      const updatedUser = {
        ...user,
        balance: parseFloat((user.balance + refund).toFixed(2)),
        activeInvestmentsAmount: Math.max(0, parseFloat((user.activeInvestmentsAmount - refund).toFixed(2)))
      };

      const txId = 'tx_cop_rel_' + Math.random().toString(36).substring(2, 9);
      const newTx: Transaction = {
        id: txId,
        type: 'payout',
        amount: refund,
        method: 'Strategy Allocation Release',
        timestamp: new Date().toISOString(),
        status: 'completed',
        details: `Stopped copying strategist ${trader.name}. Allocated capital returned.`
      };

      setCopyTraders(prev => prev.map(t => t.id === traderId ? { ...t, isCopied: false, copiedAmount: 0 } : t));

      await setDoc(doc(db, 'users', user.id), updatedUser);
      await setDoc(doc(db, 'users', user.id, 'transactions', txId), newTx);

      return { success: true, message: `Allocated copy funds returned to your balance.` };
    } else {
      if (!amount || amount <= 0) return { success: false, message: 'Enter a valid positive copy allocation.' };
      if (amount > user.balance) return { success: false, message: 'Insufficient balance available to copy.' };

      const updatedUser = {
        ...user,
        balance: parseFloat((user.balance - amount).toFixed(2)),
        activeInvestmentsAmount: parseFloat((user.activeInvestmentsAmount + amount).toFixed(2))
      };

      const txId = 'tx_cop_alloc_' + Math.random().toString(36).substring(2, 9);
      const newTx: Transaction = {
        id: txId,
        type: 'investment',
        amount,
        method: 'Mirror Strategy Alloc',
        timestamp: new Date().toISOString(),
        status: 'completed',
        details: `Copied elite strategist ${trader.name} with allocation.`
      };

      setCopyTraders(prev => prev.map(t => t.id === traderId ? { ...t, isCopied: true, copiedAmount: amount } : t));

      await setDoc(doc(db, 'users', user.id), updatedUser);
      await setDoc(doc(db, 'users', user.id, 'transactions', txId), newTx);

      return { success: true, message: `Capital assigned. Tracking ${trader.name}'s active trade profiles successfully!` };
    }
  };

  // Administrative Manipulations
  const adminUpdateUser = async (fields: Partial<User>) => {
    if (!user) return;
    const updatedUser = { ...user, ...fields };
    await setDoc(doc(db, 'users', user.id), updatedUser);
  };

  const adminApproveTransaction = async (txId: string) => {
    if (!user) return;
    const tx = transactions.find(t => t.id === txId);
    if (tx && tx.status === 'pending') {
      if (tx.type === 'deposit') {
        const updatedUser = { ...user, balance: parseFloat((user.balance + tx.amount).toFixed(2)) };
        await setDoc(doc(db, 'users', user.id), updatedUser);
      }
      await updateDoc(doc(db, 'users', user.id, 'transactions', txId), { status: 'completed' });
    }
  };

  const adminRejectTransaction = async (txId: string) => {
    if (!user) return;
    const tx = transactions.find(t => t.id === txId);
    if (tx && tx.status === 'pending') {
      if (tx.type === 'withdrawal') {
        const updatedUser = { 
          ...user, 
          balance: parseFloat((user.balance + tx.amount).toFixed(2)),
          totalWithdrawn: Math.max(0, parseFloat((user.totalWithdrawn - tx.amount).toFixed(2)))
        };
        await setDoc(doc(db, 'users', user.id), updatedUser);
      }
      await updateDoc(doc(db, 'users', user.id, 'transactions', txId), { status: 'failed' });
    }
  };

  // Real-time trading ticking intervals engine!
  const triggerMarketTick = () => {
    const s = stateRef.current;
    if (!s.user) return;

    // 1. Tick Prices
    const tickedAssets = s.marketAssets.map(asset => {
      // Ticking delta -0.5% to +0.55% (slight upward bias overall)
      const changePercent = (Math.random() * 1.05 - 0.5) / 100;
      const originalPrice = asset.price;
      const newPrice = originalPrice * (1 + changePercent);
      const isForex = asset.category === 'forex';
      
      const newHistory = [...asset.history24h.slice(1), parseFloat(newPrice.toFixed(isForex ? 5 : 2))];

      return {
        ...asset,
        price: parseFloat(newPrice.toFixed(isForex ? 5 : 2)),
        change24h: parseFloat((asset.change24h + changePercent * 10).toFixed(2)),
        history24h: newHistory
      };
    });

    setMarketAssets(tickedAssets);

    // 2. Adjust Running CFDs Live Values
    if (s.trades.length > 0) {
      setTrades(currTrades => currTrades.map(tr => {
        if (tr.status === 'open') {
          const currentAsset = tickedAssets.find(a => a.symbol === tr.symbol);
          if (currentAsset) {
            const priceChangeRatio = (currentAsset.price - tr.entryPrice) / tr.entryPrice;
            const direction = tr.type === 'buy' ? 1 : -1;
            // Running profit calculation: margin * priceChange * leverage * multiplier
            const leverageProfit = tr.amount * priceChangeRatio * tr.leverage * direction;
            
            // Auto liquidation security guard: if loss matches margin, margin gets liquidated
            if (leverageProfit <= -tr.amount) {
              const liquidatedTrade: Trade = {
                ...tr,
                currentPrice: currentAsset.price,
                pnl: -tr.amount,
                status: 'closed',
                closedPrice: currentAsset.price
              };
              
              // Add a bad event transaction
              setTransactions(t => [
                {
                  id: 'tx_liq_' + Math.random().toString(36).substring(2, 9),
                  type: 'withdrawal',
                  amount: tr.amount,
                  method: 'CFD Margin Liquidation',
                  timestamp: new Date().toISOString(),
                  status: 'failed',
                  details: `Margin Liquidated: Position ${tr.type.toUpperCase()} ${tr.symbol} hit stop-level liquidation @ $${currentAsset.price.toLocaleString()}`
                },
                ...t
              ]);

              return liquidatedTrade;
            }

            return {
              ...tr,
              currentPrice: currentAsset.price,
              pnl: parseFloat(leverageProfit.toFixed(2))
            };
          }
        }
        return tr;
      }));
    }

    // 3. Increment Active Investment Yields dynamically in real-time!
    // We award a tiny fraction of their daily ROI every tick!
    // Since 1 Day ROI pays out daily, we'll simulate real-time growth by adding (Daily ROI % / 1000) of the investment amount to "totalEarned" with each tick.
    if (s.investments.length > 0) {
      setInvestments(currInvestments => currInvestments.map(inv => {
        if (inv.status === 'active') {
          // Fraction of expected ROI
          const stepGain = inv.amount * (inv.dailyRoi / 100) * 0.005; 
          return {
            ...inv,
            totalEarned: inv.totalEarned + stepGain
          };
        }
        return inv;
      }));
    }

    // 4. Copy traders generate yield splits too!
    const activeCopies = s.copyTraders.filter(t => t.isCopied && t.copiedAmount && t.copiedAmount > 0);
    if (activeCopies.length > 0) {
      // Add split yields into active balance/profits
      const hourlyGrowth = activeCopies.reduce((sum, trader) => {
        const allocated = trader.copiedAmount || 0;
        // Each copied strategist generates continuous small increments (approx 40% APY / tick equivalent)
        const earnFraction = allocated * (trader.roi30D / 30 / 100) * 0.004;
        return sum + earnFraction;
      }, 0);

      if (hourlyGrowth > 0) {
        setUser(curr => curr ? {
          ...curr,
          balance: parseFloat((curr.balance + hourlyGrowth * 0.4).toFixed(4)), // Share to balance
          profits: parseFloat((curr.profits + hourlyGrowth).toFixed(4)) // Display tracking
        } : null);
      }
    }
  };

  // Run the universal engine real-time interval
  useEffect(() => {
    const timer = setInterval(() => {
      triggerMarketTick();
    }, 4500); // Ticks every 4.5 seconds for incredible realism!
    return () => clearInterval(timer);
  }, []);

  return (
    <DashboardContext.Provider
      value={{
        user,
        transactions,
        investments,
        trades,
        copyTraders,
        marketAssets,
        investmentPlans: INITIAL_PLANS,
        login,
        register,
        logout,
        deposit,
        withdraw,
        invest,
        claimInvestment,
        openTrade,
        closeTrade,
        toggleCopyTrader,
        adminUpdateUser,
        adminApproveTransaction,
        adminRejectTransaction,
        triggerMarketTick,
        verifyAccount
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};
