import React, { useState, useEffect, useCallback, useMemo } from 'react';

// The backend server URL. In a real deployment on Render, you would set this
// as an environment variable. For local testing, it points to your local server.
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Define game properties outside the component to prevent re-creation on every render.
const gameProperties = {
    dailyGrand: { standardSize: 5, range: 49, grandRange: 7 },
    lottoMax:   { standardSize: 7, range: 50 },
    lotto649:   { standardSize: 6, range: 49 }
};

// Define the strategic profiles for the auto-tune tournament.
const strategies = [
  {
    name: "Balanced",
    settings: {
      filterLimitSequentials: true,
      filterCheckSimilarity: true,
      filterCheckBalance: true,
      filterUseStatisticalSum: true,
      filterUsePositional: true,
      filterUseDelta: false,
      filterUseLastDigits: false,
      hotColdStrategy: 'balanced',
    }
  },
  {
    name: "Strict Statistical",
    settings: {
      filterLimitSequentials: true,
      filterCheckSimilarity: true,
      filterCheckBalance: true,
      filterUseStatisticalSum: true,
      filterUsePositional: true,
      filterUseDelta: true,
      filterUseLastDigits: true,
      hotColdStrategy: 'balanced',
    }
  },
  {
    name: "Hot Hunter",
    settings: {
      filterLimitSequentials: false,
      filterCheckSimilarity: true,
      filterCheckBalance: false,
      filterUseStatisticalSum: false,
      filterUsePositional: false,
      filterUseDelta: false,
      filterUseLastDigits: false,
      hotColdStrategy: 'hot',
    }
  },
  {
    name: "Cold Catcher",
    settings: {
      filterLimitSequentials: false,
      filterCheckSimilarity: true,
      filterCheckBalance: false,
      filterUseStatisticalSum: false,
      filterUsePositional: false,
      filterUseDelta: false,
      filterUseLastDigits: false,
      hotColdStrategy: 'cold',
    }
  },
  {
    name: "Minimalist",
    settings: {
      filterLimitSequentials: true,
      filterCheckSimilarity: true,
      filterCheckBalance: false,
      filterUseStatisticalSum: false,
      filterUsePositional: false,
      filterUseDelta: false,
      filterUseLastDigits: false,
      hotColdStrategy: 'balanced',
    }
  }
];

// Descriptions for the filter popups
const filterDescriptions = {
    similarity: "Eliminates combinations that are too similar to past winning numbers. It uses two tiers: a stricter check for recent draws (within 1 year) and a looser one for older draws (within 2 years).",
    sequentials: "Removes combinations that contain a long string of consecutive numbers (e.g., 15, 16, 17, 18). The current setting filters out combinations with 4 or more sequential numbers.",
    balance: "Checks for a reasonable mix of both Odd/Even and High/Low numbers. It filters out combinations that are heavily skewed one way, as these are statistically rare.",
    sumRange: "Analyzes the sum of all numbers in a combination. It eliminates sets where the sum is statistically too high or too low compared to the historical average of winning sums.",
    positional: "Examines the value of each number based on its sorted position (1st, 2nd, 3rd, etc.). It removes combinations where numbers fall outside their typical historical range for that specific position.",
    delta: "Analyzes the differences (deltas) between sorted numbers in a combination. It filters out sets where the pattern of differences is statistically uncommon compared to historical draws.",
    lastDigits: "Checks the distribution of the last digit of each number in the combination. It removes patterns where too many numbers share the same last digit (e.g., four numbers ending in '3').",
    consecutiveRepeats: "Eliminates combinations that have too many numbers repeating from the immediately preceding draw. Typically, more than 2 repeats is rare, so this filter removes combinations with 3 or more.",
    numberGroups: "Filters out combinations where all numbers are clustered in one or two decade groups (e.g., all in the 10s and 20s). It favors a better spread across the entire number range.",
    digitSum: "Calculates the sum of every individual digit in the combination (e.g., for {12, 23}, sum is 1+2+2+3=8). It removes sets where this digit sum is outside the historical statistical norm.",
    rankSum: "Ranks each number by its historical frequency (most frequent = rank 1). This filter eliminates combinations where the sum of these ranks is statistically too high or too low, avoiding sets of all 'popular' or all 'unpopular' numbers.",
    arithmetic: "Filters out combinations that form a clear mathematical pattern, like an arithmetic progression (e.g., 10-20-30-40-50 or 7-14-21-28-35). These patterns are extremely rare in random draws."
};

// Payout tables for each game
const payoutTables = {
    lottoMax: {
        "7/7": "Jackpot (Share of 89.25% of Pool's Fund)",
        "6/7 + Bonus": "Share of 2.5% of Pool's Fund",
        "6/7": "Share of 2.5% of Pool's Fund",
        "5/7 + Bonus": "Share of 1.5% of Pool's Fund",
        "5/7": "Share of 3.5% of Pool's Fund",
        "4/7 + Bonus": "Share of 0.75% of Pool's Fund",
        "4/7": "$20",
        "3/7 + Bonus": "$20",
        "3/7": "Free Play",
    },
    lotto649: {
        "6/6": "Jackpot (Share of 80.5% of Main Prize Pool)",
        "5/6 + Bonus": "Share of 6% of Main Prize Pool",
        "5/6": "Share of 5% of Main Prize Pool",
        "4/6": "Share of 8.5% of Main Prize Pool",
        "3/6": "$10",
        "2/6 + Bonus": "$5",
        "2/6": "Free Play",
        "Gold Ball": "Guaranteed $1 Million (or grows to $10M+)",
    },
    dailyGrand: {
        "5/5 + Grand Number": "$1,000 a day for life",
        "5/5": "$25,000 a year for life",
        "4/5 + Grand Number": "$1,000",
        "4/5": "$500",
        "3/5 + Grand Number": "$100",
        "3/5": "$20",
        "2/5 + Grand Number": "$10",
        "1/5 + Grand Number": "$4",
        "0/5 + Grand Number": "Free Play",
    }
};


// --- HELPER FUNCTIONS (defined outside component for performance and stability) ---
const calculateMeanAndStdDev = (arr) => {
    if (arr.length === 0) return { mean: 0, stdDev: 0 };
    const mean = arr.reduce((acc, val) => acc + val, 0) / arr.length;
    const stdDev = Math.sqrt(arr.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / arr.length);
    return { mean, stdDev };
};

const combinations = (n, k) => {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    if (k > n / 2) k = n - k;
    let res = 1;
    for (let i = 1; i <= k; i++) {
        res = res * (n - i + 1) / i;
    }
    return Math.round(res);
};

const containsTooManySequentials = (numbers, maxSequential) => {
    const sortedNumbers = [...numbers].sort((a, b) => a - b);
    let sequentialCount = 0;
    for (let i = 0; i < sortedNumbers.length - 1; i++) {
        if (sortedNumbers[i + 1] === sortedNumbers[i] + 1) {
            sequentialCount++;
        } else {
            sequentialCount = 0;
        }
        if (sequentialCount >= maxSequential) return true;
    }
    return false;
};

const isArithmeticProgression = (numbers) => {
    if (numbers.length < 3) return false;
    const sorted = [...numbers].sort((a, b) => a - b);
    const diff = sorted[1] - sorted[0];
    if (diff <= 1) return false; // Exclude simple sequential numbers
    for (let i = 2; i < sorted.length; i++) {
        if (sorted[i] - sorted[i - 1] !== diff) {
            return false;
        }
    }
    return true;
};

const isTooSimilar = (generatedNumbers, historicalDraws, similarityThresholdValue) => {
    const generatedSet = new Set(generatedNumbers);
    if (!Array.isArray(historicalDraws) || historicalDraws.length === 0) return false;

    const numToMatch = Math.ceil(generatedNumbers.length * (similarityThresholdValue / 100));

    for (const historicalDraw of historicalDraws) {
        let matchCount = 0;
        if (Array.isArray(historicalDraw.main)) {
            for (const num of historicalDraw.main) {
                if (generatedSet.has(num)) {
                    matchCount++;
                }
            }
        }
        if (matchCount >= numToMatch) {
            return true;
        }
    }
    return false;
};

const calculateSimilarity = (numbers, historicalDraws) => {
    if (!Array.isArray(historicalDraws) || historicalDraws.length === 0) return 0;
    const numberSet = new Set(numbers);
    let maxSimilarity = 0;

    for (const historicalDraw of historicalDraws) {
        if (Array.isArray(historicalDraw.main)) {
            const matchCount = historicalDraw.main.filter(num => numberSet.has(num)).length;
            const similarity = (matchCount / numbers.length) * 100;
            if (similarity > maxSimilarity) {
                maxSimilarity = similarity;
            }
        }
    }
    return maxSimilarity;
};


const getDigitalRoot = (n) => {
    while (n > 9) {
        n = n.toString().split('').reduce((sum, digit) => sum + parseInt(digit, 10), 0);
    }
    return n;
};

// Main App component
const App = () => {
    // State variables
    const [selectedGame, setSelectedGame] = useState('lottoMax');
    const [generatedPicks, setGeneratedPicks] = useState([]);
    const [historicalData, setHistoricalData] = useState({});
    const [message, setMessage] = useState('Loading historical data...');
    const [isLoading, setIsLoading] = useState(true);
    const [numSetsToGenerate, setNumSetsToGenerate] = useState(1);
    const [similarityThreshold, setSimilarityThreshold] = useState(60);
    const [recentSimilarityThreshold, setRecentSimilarityThreshold] = useState(49);
    const [isTfLoaded, setIsTfLoaded] = useState(false);
    const [isTraining, setIsTraining] = useState(false);
    const [aiModel, setAiModel] = useState(null);
    const [reductionAnalysis, setReductionAnalysis] = useState(null);
    const [popupContent, setPopupContent] = useState({ show: false, title: '', description: '' });
    const [showPayouts, setShowPayouts] = useState(false);
    
    // State for manual filter toggles
    const [filterLimitSequentials, setFilterLimitSequentials] = useState(true);
    const [filterCheckSimilarity, setFilterCheckSimilarity] = useState(true);
    const [filterCheckBalance, setFilterCheckBalance] = useState(true);
    const [filterUseStatisticalSum, setFilterUseStatisticalSum] = useState(true);
    const [filterUsePositional, setFilterUsePositional] = useState(true);
    const [filterUseDelta, setFilterUseDelta] = useState(true);
    const [filterUseLastDigits, setFilterUseLastDigits] = useState(true);
    const [filterUseConsecutive, setFilterUseConsecutive] = useState(true);
    const [filterUseNumberGroups, setFilterUseNumberGroups] = useState(true);
    const [filterUseDigitSum, setFilterUseDigitSum] = useState(true);
    const [filterUseRankSum, setFilterUseRankSum] = useState(true);
    const [filterUseArithmetic, setFilterUseArithmetic] = useState(true);
    
    const [poolStrategy, setPoolStrategy] = useState('dynamic'); // 'dynamic' or 'frequency'
    const [poolSize, setPoolSize] = useState(30);

    // --- SCRIPT AND DATA LOADING ---
    useEffect(() => {
        // Load TensorFlow.js
        const tfScript = document.createElement('script');
        tfScript.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js';
        tfScript.async = true;
        tfScript.onload = () => setIsTfLoaded(true);
        document.body.appendChild(tfScript);

        return () => {
            document.body.removeChild(tfScript);
        };
    }, []);

    useEffect(() => {
        const fetchGameData = async () => {
            setIsLoading(true);
            setMessage(`Loading historical data for ${selectedGame}...`);
            try {
                const response = await fetch(`${API_URL}/api/data/${selectedGame}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setHistoricalData(prevData => ({ ...prevData, [selectedGame]: data }));
                setMessage(`Successfully loaded ${data.length} draws for ${selectedGame}.`);
            } catch (error) {
                console.error("Failed to fetch game data:", error);
                setMessage(`Failed to load data for ${selectedGame}. Please ensure the backend is running and the database is populated.`);
            } finally {
                setIsLoading(false);
            }
        };

        fetchGameData();
    }, [selectedGame]);


    // --- COMPUTED DATA (useMemo) ---
    const validDraws = useMemo(() => {
        const historyForGame = historicalData[selectedGame];
        if (!historyForGame || historyForGame.length === 0) return [];
        const standardSize = gameProperties[selectedGame].standardSize;
        return historyForGame.filter(d => d.main && d.main.length >= standardSize)
                             .sort((a, b) => new Date(a.date) - new Date(b.date));
    }, [historicalData, selectedGame]);

    const sumStats = useMemo(() => {
        if (validDraws.length < 10) return null;
        const sums = validDraws.map(draw => draw.main.reduce((acc, num) => acc + num, 0));
        return calculateMeanAndStdDev(sums);
    }, [validDraws]);

    const digitSumStats = useMemo(() => {
        if (validDraws.length < 10) return null;
        const sums = validDraws.map(draw => 
            draw.main.reduce((acc, num) => {
                const digitSum = num.toString().split('').reduce((s, d) => s + parseInt(d, 10), 0);
                return acc + digitSum;
            }, 0)
        );
        return calculateMeanAndStdDev(sums);
    }, [validDraws]);

    const rankStats = useMemo(() => {
        if (validDraws.length < 10) return null;
        const gameInfo = gameProperties[selectedGame];
        const frequencies = calculateFrequencies(validDraws, gameInfo.range);
        
        const rankedNumbers = Array.from({ length: gameInfo.range }, (_, i) => i + 1)
            .map(num => ({ num, freq: frequencies[num] || 0 }))
            .sort((a, b) => b.freq - a.freq);
            
        const rankMap = new Map();
        rankedNumbers.forEach((item, index) => {
            rankMap.set(item.num, index + 1);
        });

        const rankSums = validDraws.map(draw => 
            draw.main.reduce((acc, num) => acc + (rankMap.get(num) || gameInfo.range), 0)
        );
        
        const stats = calculateMeanAndStdDev(rankSums);
        return { ...stats, rankMap };
    }, [validDraws, selectedGame, calculateFrequencies]);

    const positionalStats = useMemo(() => {
        if (validDraws.length < 10) return { bounds: null, averages: null };
        const standardSize = gameProperties[selectedGame].standardSize;
        const positions = Array.from({ length: standardSize }, () => []);
        validDraws.forEach(draw => {
            const sortedDraw = [...draw.main].sort((a, b) => a - b);
            sortedDraw.forEach((num, index) => {
                positions[index].push(num);
            });
        });

        const averages = Array.from({ length: gameProperties[selectedGame].range + 1 }, () => ({ sum: 0, count: 0 }));
        validDraws.forEach(draw => {
            const sorted = [...draw.main].sort((a,b) => a-b);
            sorted.forEach((num, index) => {
                averages[num].sum += index + 1;
                averages[num].count++;
            });
        });
        const finalAverages = averages.map(d => d.count > 0 ? d.sum / d.count : 0);

        const bounds = positions.map(posArr => {
            const { mean, stdDev } = calculateMeanAndStdDev(posArr);
            const factor = 1.5;
            return { min: Math.round(mean - factor * stdDev), max: Math.round(mean + factor * stdDev) };
        });

        return { bounds, averages: finalAverages };
    }, [validDraws, selectedGame]);
    
    const pairingStats = useMemo(() => {
        const range = gameProperties[selectedGame].range;
        const matrix = Array.from({ length: range + 1 }, () => Array(range + 1).fill(0));
        validDraws.forEach(draw => {
            for(let i = 0; i < draw.main.length; i++) {
                for(let j = i + 1; j < draw.main.length; j++) {
                    const num1 = draw.main[i];
                    const num2 = draw.main[j];
                    matrix[num1][num2]++;
                    matrix[num2][num1]++;
                }
            }
        });
        return matrix;
    }, [validDraws, selectedGame]);

    const gapStats = useMemo(() => {
        const range = gameProperties[selectedGame].range;
        const lastSeen = Array(range + 1).fill(-1);
        const gaps = Array.from({ length: range + 1 }, () => []);

        validDraws.forEach((draw, index) => {
            draw.main.forEach(num => {
                if (lastSeen[num] !== -1) {
                    gaps[num].push(index - lastSeen[num]);
                }
                lastSeen[num] = index;
            });
        });

        const avgGaps = gaps.map(g => g.length > 0 ? g.reduce((a, b) => a + b, 0) / g.length : validDraws.length);
        const currentGaps = lastSeen.map((last, index) => last === -1 ? validDraws.length : validDraws.length - 1 - last);
        return { avgGaps, currentGaps };
    }, [validDraws, selectedGame]);


    const deltaStats = useMemo(() => {
        if (validDraws.length < 10) return null;
        const deltaSums = validDraws.map(draw => {
            const sorted = [...draw.main].sort((a, b) => a - b);
            let deltaSum = 0;
            for (let i = 0; i < sorted.length - 1; i++) {
                deltaSum += sorted[i+1] - sorted[i];
            }
            return deltaSum;
        });
        return calculateMeanAndStdDev(deltaSums);
    }, [validDraws]);

    const lastDigitStats = useMemo(() => {
        if (validDraws.length < 10) return null;
        const standardSize = gameProperties[selectedGame].standardSize;
        const lastDigitCounts = Array(10).fill(0);
        validDraws.forEach(draw => {
            draw.main.forEach(num => {
                lastDigitCounts[num % 10]++;
            });
        });
        const totalDigits = validDraws.length * standardSize;
        return lastDigitCounts.map(count => count / totalDigits);
    }, [validDraws, selectedGame]);

    const hotColdNumbers = useMemo(() => {
        if (validDraws.length < 20) return { hot: [], cold: [] };
        const recentDraws = validDraws.slice(-20);
        const hotColdCounts = new Array(gameProperties[selectedGame].range + 1).fill(0);
        recentDraws.forEach(draw => draw.main.forEach(num => hotColdCounts[num]++));
        
        const allNumbers = Array.from({length: gameProperties[selectedGame].range}, (_, i) => i + 1);
        const numberData = allNumbers.map(num => ({num, count: hotColdCounts[num]}));
        numberData.sort((a, b) => b.count - a.count);
        
        const hotCount = Math.floor(allNumbers.length * 0.2);
        return {
            hot: numberData.slice(0, hotCount).map(d => d.num),
            cold: numberData.slice(-hotCount).map(d => d.num),
        };
    }, [validDraws, selectedGame]);

    const dynamicWeightedPool = useMemo(() => {
        if (!rankStats || !hotColdNumbers || !gapStats) return [];
        const { range } = gameProperties[selectedGame];
        const { rankMap } = rankStats;
        const { hot, cold } = hotColdNumbers;
        const { avgGaps, currentGaps } = gapStats;

        const hotSet = new Set(hot);
        const coldSet = new Set(cold);

        const scores = Array.from({ length: range }, (_, i) => i + 1).map(num => {
            const rankScore = 1 - ((rankMap.get(num) || range) / range);
            const hotColdScore = hotSet.has(num) ? 0.5 : coldSet.has(num) ? -0.5 : 0;
            const dueScore = (currentGaps[num] > (avgGaps[num] * 1.5)) ? 1 : 0;

            const finalScore = (rankScore * 0.5) + (hotColdScore * 0.2) + (dueScore * 0.3);
            return { num, finalScore };
        });

        scores.sort((a, b) => b.finalScore - a.finalScore);
        return scores.map(s => s.num);

    }, [rankStats, hotColdNumbers, gapStats, selectedGame]);

    const isSumWithinRange = useCallback((numbers) => {
        if (!filterUseStatisticalSum || !sumStats) return true;
        const sum = numbers.reduce((acc, num) => acc + num, 0);
        const factor = 1.5;
        const min = sumStats.mean - factor * sumStats.stdDev;
        const max = sumStats.mean + factor * sumStats.stdDev;
        return sum >= min && sum <= max;
    }, [sumStats, filterUseStatisticalSum]);

    const isDigitSumWithinRange = useCallback((numbers) => {
        if (!filterUseDigitSum || !digitSumStats) return true;
        const sum = numbers.reduce((acc, num) => acc + num.toString().split('').reduce((s, d) => s + parseInt(d, 10), 0), 0);
        const factor = 1.5;
        const min = digitSumStats.mean - factor * digitSumStats.stdDev;
        const max = digitSumStats.mean + factor * digitSumStats.stdDev;
        return sum >= min && sum <= max;
    }, [digitSumStats, filterUseDigitSum]);

    const isRankSumWithinRange = useCallback((numbers) => {
        if (!filterUseRankSum || !rankStats) return true;
        const sum = numbers.reduce((acc, num) => acc + (rankStats.rankMap.get(num) || 0), 0);
        const factor = 1.5;
        const min = rankStats.mean - factor * rankStats.stdDev;
        const max = rankStats.mean + factor * rankStats.stdDev;
        return sum >= min && sum <= max;
    }, [rankStats, filterUseRankSum]);

    const isBalancedOddEven = useCallback((numbers) => {
        const numCount = numbers.length;
        const oddCount = numbers.filter(num => num % 2 !== 0).length;
        const floor = Math.floor(numCount / 2) - 1;
        const ceil = Math.ceil(numCount / 2) + 1;
        return oddCount >= floor && oddCount <= ceil;
    }, []);

    const isBalancedHighLow = useCallback((numbers, rangeMax) => {
        const numCount = numbers.length;
        const midPoint = Math.ceil(rangeMax / 2);
        const lowCount = numbers.filter(num => num <= midPoint).length;
        const floor = Math.floor(numCount / 2) - 1;
        const ceil = Math.ceil(numCount / 2) + 1;
        return lowCount >= floor && lowCount <= ceil;
    }, []);

    const isWithinPositionalBounds = useCallback((numbers, bounds) => {
        if (!bounds || numbers.length !== bounds.length) return true;
        const sortedNumbers = [...numbers].sort((a, b) => a - b);
        for (let i = 0; i < sortedNumbers.length; i++) {
            const num = sortedNumbers[i];
            const { min, max } = bounds[i];
            if (num < min || num > max) return false;
        }
        return true;
    }, []);

    const isDeltaSumValid = useCallback((numbers, stats) => {
        if (!stats) return true;
        const sorted = [...numbers].sort((a, b) => a - b);
        let deltaSum = 0;
        for (let i = 0; i < sorted.length - 1; i++) {
            deltaSum += sorted[i+1] - sorted[i];
        }
        const factor = 1.5;
        const min = stats.mean - factor * stats.stdDev;
        const max = stats.mean + factor * stats.stdDev;
        return deltaSum >= min && deltaSum <= max;
    }, []);

    const hasValidLastDigitDistribution = useCallback((numbers, stats) => {
        if (!stats) return true;
        const lastDigits = numbers.map(n => n % 10);
        const counts = Array(10).fill(0);
        lastDigits.forEach(d => counts[d]++);
        if (Math.max(...counts) > 3) return false;
        if (new Set(lastDigits).size < numbers.length / 2) return false;
        return true;
    }, []);

    const hasValidConsecutiveRepeat = useCallback((numbers, lastDrawNumbers) => {
        if (!filterUseConsecutive || !lastDrawNumbers) return true;
        const lastDrawSet = new Set(lastDrawNumbers);
        const repeatCount = numbers.filter(n => lastDrawSet.has(n)).length;
        return repeatCount <= 2; // Allow max 2 numbers to repeat from the previous draw
    }, [filterUseConsecutive]);

    const hasValidNumberGroupDistribution = useCallback((numbers, rangeMax) => {
        if (!filterUseNumberGroups) return true;
        const groups = new Array(Math.ceil(rangeMax / 10)).fill(0);
        numbers.forEach(n => {
            const groupIndex = Math.floor((n - 1) / 10);
            if (groupIndex < groups.length) {
                groups[groupIndex]++;
            }
        });
        if (Math.max(...groups) >= numbers.length -1) return false;
        if (Math.max(...groups) > 4) return false;
        return true;
    }, [filterUseNumberGroups]);


    // --- MAIN GENERATION LOGIC ---
    const generateSinglePickSet = useCallback((isOpposite, overridePool = null) => {
        const gameInfo = gameProperties[selectedGame];
        const numCount = gameInfo.standardSize;
        const rangeMax = gameInfo.range;
        const historyForGame = validDraws;
        const isDailyGrand = selectedGame === 'dailyGrand';

        if (!historyForGame || historyForGame.length === 0) {
            setMessage(`Historical data not available for ${selectedGame}.`);
            return null;
        }
        
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        const lastYearDraws = historyForGame.filter(draw => new Date(draw.date) >= oneYearAgo);
        const olderDraws = historyForGame.filter(draw => new Date(draw.date) >= twoYearsAgo && new Date(draw.date) < oneYearAgo);
        const lastDrawNumbers = historyForGame.length > 0 ? historyForGame[historyForGame.length - 1].main : null;
        
        const initialNumberPool = overridePool;

        let currentMainPicks = [];
        let attempts = 0;
        const maxAttempts = 5000;

        do {
            let picks = new Set();
            attempts++;
            if (attempts > maxAttempts) {
                return null;
            }

            let availableNumbers = [...initialNumberPool];

            if (availableNumbers.length < numCount) {
                 return null;
            }

            while (picks.size < numCount && availableNumbers.length > 0) {
                const newPick = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];
                if (!picks.has(newPick)) {
                    picks.add(newPick);
                    availableNumbers = availableNumbers.filter(num => num !== newPick);
                }
            }
            currentMainPicks = Array.from(picks).sort((a, b) => a - b);

        } while (
            currentMainPicks.length < numCount ||
            (!isOpposite && filterUseArithmetic && isArithmeticProgression(currentMainPicks)) ||
            (!isOpposite && filterLimitSequentials && containsTooManySequentials(currentMainPicks, 3)) ||
            (!isOpposite && filterCheckBalance && !isBalancedOddEven(currentMainPicks)) ||
            (!isOpposite && filterCheckBalance && !isBalancedHighLow(currentMainPicks, rangeMax)) ||
            (!isOpposite && filterCheckSimilarity && (isTooSimilar(currentMainPicks, lastYearDraws, recentSimilarityThreshold) || isTooSimilar(currentMainPicks, olderDraws, similarityThreshold))) ||
            (!isOpposite && !isSumWithinRange(currentMainPicks)) ||
            (!isOpposite && !isDigitSumWithinRange(currentMainPicks)) ||
            (!isOpposite && !isRankSumWithinRange(currentMainPicks)) ||
            (!isOpposite && filterUsePositional && !isWithinPositionalBounds(currentMainPicks, positionalStats.bounds)) ||
            (!isOpposite && filterUseDelta && !isDeltaSumValid(currentMainPicks, deltaStats)) ||
            (!isOpposite && filterUseLastDigits && !hasValidLastDigitDistribution(currentMainPicks, lastDigitStats)) ||
            (!isOpposite && !hasValidConsecutiveRepeat(currentMainPicks, lastDrawNumbers)) ||
            (!isOpposite && !hasValidNumberGroupDistribution(currentMainPicks, rangeMax))
        );

        if (currentMainPicks.length < numCount) return null;

        const result = { main: currentMainPicks };
        if (isDailyGrand) {
            const possibleGrandNumbers = [1, 2, 3, 4, 5, 6, 7];
            
            const lastThreeGrandNumbers = historyForGame
                .slice(-3)
                .map(draw => draw.grand)
                .filter(gn => gn !== undefined);

            let availableGrandNumbers = possibleGrandNumbers.filter(
                num => !lastThreeGrandNumbers.includes(num)
            );

            if (availableGrandNumbers.length === 0) {
                availableGrandNumbers = possibleGrandNumbers;
            }

            const randomIndex = Math.floor(Math.random() * availableGrandNumbers.length);
            result.grand = availableGrandNumbers[randomIndex];
        }
        return result;

    }, [
        selectedGame, validDraws, filterLimitSequentials, filterCheckBalance,
        filterCheckSimilarity, similarityThreshold, recentSimilarityThreshold, filterUseStatisticalSum, filterUsePositional, sumStats, positionalStats,
        filterUseDelta, deltaStats, filterUseLastDigits, lastDigitStats,
        isSumWithinRange, isBalancedOddEven, isBalancedHighLow, isWithinPositionalBounds, isDeltaSumValid, hasValidLastDigitDistribution,
        filterUseConsecutive, filterUseNumberGroups, filterUseDigitSum, digitSumStats, hasValidConsecutiveRepeat, hasValidNumberGroupDistribution, isDigitSumWithinRange,
        filterUseRankSum, rankStats, isRankSumWithinRange, filterUseArithmetic
    ]);

    // --- BUTTON HANDLERS ---
    const handleGenerateFilteredSamples = useCallback(() => {
        setReductionAnalysis(null);

        let poolToUse;
        if (poolStrategy === 'dynamic') {
            poolToUse = dynamicWeightedPool.slice(0, poolSize);
        } else {
            const frequencies = calculateFrequencies(validDraws, gameProperties[selectedGame].range);
            const allNumbersWithFreq = Array.from({ length: gameProperties[selectedGame].range }, (_, i) => i + 1)
                .map(num => ({ num, freq: frequencies[num] || 0 }));
            allNumbersWithFreq.sort((a, b) => a.freq - b.freq);
            poolToUse = allNumbersWithFreq.slice(0, poolSize).map(item => item.num);
        }

        if (poolToUse.length < gameProperties[selectedGame].standardSize) {
            setMessage("The generated number pool is too small to create a valid ticket. Try increasing the Pool Size.");
            setGeneratedPicks([]);
            return;
        }

        let allGeneratedSets = [];
        for (let i = 0; i < numSetsToGenerate; i++) {
            const currentSet = generateSinglePickSet(false, poolToUse);
            if (currentSet) {
                allGeneratedSets.push(currentSet);
            }
        }
        
        if (allGeneratedSets.length > 0) {
            setGeneratedPicks(allGeneratedSets);
            let successMessage = `Successfully generated ${allGeneratedSets.length} sample(s) from the filtered combination pool.`;
            if (allGeneratedSets.length < numSetsToGenerate) {
                successMessage += "\n(Could not generate all sets with the current filter settings.)";
            }
            setMessage(successMessage);
        } else {
            setGeneratedPicks([]);
            setMessage("Could not generate any picks with the current filter settings. Please try relaxing the filters.");
        }
    }, [numSetsToGenerate, generateSinglePickSet, poolStrategy, dynamicWeightedPool, poolSize, validDraws, selectedGame, calculateFrequencies]);
    
    const handleAnalyzePastDraws = useCallback(() => {
        const numDrawsForAnalysis = 10;
        setReductionAnalysis(null);
        if (validDraws.length < numDrawsForAnalysis) {
            setMessage(`Not enough historical data for analysis. Required: ${numDrawsForAnalysis}, Found: ${validDraws.length}.`);
            setGeneratedPicks([]);
            return;
        }

        const gameInfo = gameProperties[selectedGame];
        const recentDrawsToAnalyze = validDraws.slice(-numDrawsForAnalysis);

        let analysisResultsMessage = `Past Draw Analysis (Last ${numDrawsForAnalysis} Draws):\n\n`;

        recentDrawsToAnalyze.forEach((draw) => {
            const historyBeforeDraw = validDraws.filter(d => new Date(d.date) < new Date(draw.date));
            if(historyBeforeDraw.length === 0) return;

            const lastDrawNumbers = historyBeforeDraw[historyBeforeDraw.length - 1].main;

            const oneYearBeforeDraw = new Date(draw.date); oneYearBeforeDraw.setFullYear(oneYearBeforeDraw.getFullYear() - 1);
            const twoYearsBeforeDraw = new Date(draw.date); twoYearsBeforeDraw.setFullYear(twoYearsBeforeDraw.getFullYear() - 2);

            const lastYearDrawsForThisDraw = historyBeforeDraw.filter(d => new Date(d.date) >= oneYearBeforeDraw);
            const olderDrawsForThisDraw = historyBeforeDraw.filter(d => new Date(d.date) >= twoYearsBeforeDraw && new Date(d.date) < oneYearBeforeDraw);

            const recentSim = calculateSimilarity(draw.main, lastYearDrawsForThisDraw);
            const olderSim = calculateSimilarity(draw.main, olderDrawsForThisDraw);

            const frequencies = calculateFrequencies(historyBeforeDraw, gameInfo.range);
            const allNumbersWithFreq = Array.from({ length: gameInfo.range }, (_, i) => i + 1).map(num => ({ num, freq: frequencies[num] || 0 }));
            allNumbersWithFreq.sort((a, b) => a.freq - b.freq);
            
            const numberPool = new Set(allNumbersWithFreq.slice(0, poolSize).map(item => item.num));
            const inPoolNumbers = draw.main.filter(num => numberPool.has(num));
            const poolHitRate = (inPoolNumbers.length / gameInfo.standardSize) * 100;

            let probOfAtLeast = 0;
            const hitsToWin = selectedGame === 'dailyGrand' ? 2 : 3;
            if (gameInfo.standardSize <= numberPool.size) {
                let probOfLosing = 0;
                for(let i=0; i < hitsToWin; i++){
                  probOfLosing += hypergeometricProbability(numberPool.size, inPoolNumbers.length, gameInfo.standardSize, i);
                }
                probOfAtLeast = 1 - probOfLosing;
            }

            let failedFilters = [];
            if (filterUseArithmetic && isArithmeticProgression(draw.main)) failedFilters.push("Arithmetic");
            if (filterLimitSequentials && containsTooManySequentials(draw.main, 3)) failedFilters.push("Sequential");
            if (filterCheckBalance && !isBalancedOddEven(draw.main)) failedFilters.push("Odd/Even");
            if (filterCheckBalance && !isBalancedHighLow(draw.main, gameInfo.range)) failedFilters.push("High/Low");
            if (filterUseStatisticalSum && !isSumWithinRange(draw.main)) failedFilters.push("Sum Range");
            if (filterUseDigitSum && !isDigitSumWithinRange(draw.main)) failedFilters.push("Digit Sum");
            if (filterUseRankSum && !isRankSumWithinRange(draw.main)) failedFilters.push("Rank Sum");
            if (filterUsePositional && !isWithinPositionalBounds(draw.main, positionalStats.bounds)) failedFilters.push("Positional");
            if (filterUseDelta && !isDeltaSumValid(draw.main, deltaStats)) failedFilters.push("Delta");
            if (filterUseLastDigits && !hasValidLastDigitDistribution(draw.main, lastDigitStats)) failedFilters.push("Last Digit");
            if (filterUseConsecutive && !hasValidConsecutiveRepeat(draw.main, lastDrawNumbers)) failedFilters.push("Consecutive");
            if (filterUseNumberGroups && !hasValidNumberGroupDistribution(draw.main, gameInfo.range)) failedFilters.push("Groups");
            
            const checkResult = failedFilters.length === 0 ? "PASSED" : `FAILED (${failedFilters.join(', ')})`;

            analysisResultsMessage += `Draw: ${draw.date} - [${draw.main.join(', ')}]\n`;
            analysisResultsMessage += `  - Pool Size: ${numberPool.size} / ${gameInfo.range} | Hit Rate: ${poolHitRate.toFixed(1)}% (${inPoolNumbers.length}/${gameInfo.standardSize})\n`;
            analysisResultsMessage += `  - Similarity (Recent/Older): ${recentSim.toFixed(0)}% / ${olderSim.toFixed(0)}%\n`;
            analysisResultsMessage += `  - P(≥${hitsToWin} hits): ${(Math.max(0, probOfAtLeast) * 100).toFixed(2)}%\n`;
            analysisResultsMessage += `  - Filter Check: ${checkResult}\n\n`;
        });

        setMessage(analysisResultsMessage);
        setGeneratedPicks([]);
    }, [
        selectedGame, validDraws, positionalStats, sumStats, deltaStats, lastDigitStats, digitSumStats, rankStats,
        filterLimitSequentials, filterCheckBalance, filterUseStatisticalSum, filterUsePositional, filterUseDelta, filterUseLastDigits,
        filterUseConsecutive, filterUseNumberGroups, filterUseDigitSum, filterUseRankSum, filterUseArithmetic,
        isSumWithinRange, isDigitSumWithinRange, isRankSumWithinRange, isBalancedOddEven, isBalancedHighLow, isWithinPositionalBounds,
        isDeltaSumValid, hasValidLastDigitDistribution, hasValidConsecutiveRepeat, hasValidNumberGroupDistribution, poolSize, calculateFrequencies
    ]);

    const handleStrategicAutoTune = useCallback(() => {
        setReductionAnalysis(null);
        if (validDraws.length < 20) {
            setMessage("Please upload sufficient historical data (at least 20 draws) to auto-tune.");
            return;
        }
        setMessage("🚀 Starting Strategic Auto-Tune... This will take a moment.");

        setTimeout(() => {
            const gameInfo = gameProperties[selectedGame];
            const standardSize = gameInfo.standardSize;
            const recentDrawsToAnalyze = validDraws.slice(-10);

            if (recentDrawsToAnalyze.length < 10) {
                setMessage("Not enough historical data for a full analysis (need at least 10 valid past draws).");
                return;
            }

            // --- Define Game-Specific Hit Target ---
            let hitTarget;
            if (selectedGame === 'dailyGrand') hitTarget = 3;
            else if (selectedGame === 'lotto649') hitTarget = 4;
            else if (selectedGame === 'lottoMax') hitTarget = 4;
            else hitTarget = Math.ceil(standardSize / 2); // Fallback

            let bestPoolSizeForStrategy = gameInfo.range;
            let maxSuccessfulDraws = -1;

            // --- Phase 1: Find Optimal Pool Size based on Hit Target ---
            setMessage("Phase 1: Finding optimal pool size based on your hit target...");
            for (let currentPoolSize = standardSize; currentPoolSize <= gameInfo.range; currentPoolSize++) {
                let successfulDrawsCount = 0;
                recentDrawsToAnalyze.forEach(recentDraw => {
                    const historyBeforeDraw = validDraws.filter(d => new Date(d.date) < new Date(recentDraw.date));
                    if (historyBeforeDraw.length < 20) return;

                    const frequencies = calculateFrequencies(historyBeforeDraw, gameInfo.range);
                    const allNumbersWithFreq = Array.from({ length: gameInfo.range }, (_, i) => i + 1).map(num => ({ num, freq: frequencies[num] || 0 }));
                    allNumbersWithFreq.sort((a, b) => a.freq - b.freq);
                    const numberPool = new Set(allNumbersWithFreq.slice(0, currentPoolSize).map(item => item.num));
                    
                    const inPoolNumbers = recentDraw.main.filter(num => numberPool.has(num));
                    if (inPoolNumbers.length >= hitTarget) {
                        successfulDrawsCount++;
                    }
                });

                if (successfulDrawsCount > maxSuccessfulDraws) {
                    maxSuccessfulDraws = successfulDrawsCount;
                    bestPoolSizeForStrategy = currentPoolSize;
                }
            }

            // --- Phase 2: Analyze and Adjust Filters ---
            setMessage(`Phase 2: Found best pool size (${bestPoolSizeForStrategy}). Now analyzing filters...`);
            const finalPoolFrequencies = calculateFrequencies(validDraws, gameInfo.range);
            const finalAllNumbersWithFreq = Array.from({ length: gameInfo.range }, (_, i) => i + 1).map(num => ({ num, freq: finalPoolFrequencies[num] || 0 }));
            finalAllNumbersWithFreq.sort((a, b) => a.freq - b.freq);
            const finalNumberPool = new Set(finalAllNumbersWithFreq.slice(0, bestPoolSizeForStrategy).map(item => item.num));
            
            const successfulDrawsInFinalPool = recentDrawsToAnalyze.filter(draw => {
                const hits = draw.main.filter(num => finalNumberPool.has(num)).length;
                return hits >= hitTarget;
            });

            const failedFilterCounts = {
                sequential: 0, balance: 0, sum: 0, positional: 0,
                similarity: 0, delta: 0, lastDigit: 0, consecutive: 0,
                group: 0, digitSum: 0, rankSum: 0, arithmetic: 0
            };
            
            const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            const twoYearsAgo = new Date(); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

            successfulDrawsInFinalPool.forEach(draw => {
                const historyBeforeDraw = validDraws.filter(d => new Date(d.date) < new Date(draw.date));
                const lastYearDraws = historyBeforeDraw.filter(d => new Date(d.date) >= oneYearAgo);
                const olderDraws = historyBeforeDraw.filter(d => new Date(d.date) >= twoYearsAgo && new Date(d.date) < oneYearAgo);
                const lastDrawNumbers = historyBeforeDraw.length > 0 ? historyBeforeDraw[historyBeforeDraw.length - 1].main : null;

                if (containsTooManySequentials(draw.main, 3)) failedFilterCounts.sequential++;
                if (!isBalancedOddEven(draw.main) || !isBalancedHighLow(draw.main, gameInfo.range)) failedFilterCounts.balance++;
                if (!isSumWithinRange(draw.main)) failedFilterCounts.sum++;
                if (!isWithinPositionalBounds(draw.main, positionalStats.bounds)) failedFilterCounts.positional++;
                if (isTooSimilar(draw.main, lastYearDraws, recentSimilarityThreshold) || isTooSimilar(draw.main, olderDraws, similarityThreshold)) failedFilterCounts.similarity++;
                if (!isDeltaSumValid(draw.main, deltaStats)) failedFilterCounts.delta++;
                if (!hasValidLastDigitDistribution(draw.main, lastDigitStats)) failedFilterCounts.lastDigit++;
                if (!hasValidConsecutiveRepeat(draw.main, lastDrawNumbers)) failedFilterCounts.consecutive++;
                if (!hasValidNumberGroupDistribution(draw.main, gameInfo.range)) failedFilterCounts.group++;
                if (!isDigitSumWithinRange(draw.main)) failedFilterCounts.digitSum++;
                if (!isRankSumWithinRange(draw.main)) failedFilterCounts.rankSum++;
                if (isArithmeticProgression(draw.main)) failedFilterCounts.arithmetic++;
            });

            const disabledFilters = [];
            const failureThreshold = 0.5; // If a filter fails for >50% of successful draws, disable it.
            
            if (successfulDrawsInFinalPool.length > 0) {
                if ((failedFilterCounts.sequential / successfulDrawsInFinalPool.length) > failureThreshold) { setFilterLimitSequentials(false); disabledFilters.push("Sequentials"); }
                if ((failedFilterCounts.balance / successfulDrawsInFinalPool.length) > failureThreshold) { setFilterCheckBalance(false); disabledFilters.push("Balance"); }
                if ((failedFilterCounts.sum / successfulDrawsInFinalPool.length) > failureThreshold) { setFilterUseStatisticalSum(false); disabledFilters.push("Sum Range"); }
                if ((failedFilterCounts.positional / successfulDrawsInFinalPool.length) > failureThreshold) { setFilterUsePositional(false); disabledFilters.push("Positional"); }
                if ((failedFilterCounts.similarity / successfulDrawsInFinalPool.length) > failureThreshold) { setFilterCheckSimilarity(false); disabledFilters.push("Similarity"); }
                if ((failedFilterCounts.delta / successfulDrawsInFinalPool.length) > failureThreshold) { setFilterUseDelta(false); disabledFilters.push("Delta System"); }
                if ((failedFilterCounts.lastDigit / successfulDrawsInFinalPool.length) > failureThreshold) { setFilterUseLastDigits(false); disabledFilters.push("Last Digits"); }
                if ((failedFilterCounts.consecutive / successfulDrawsInFinalPool.length) > failureThreshold) { setFilterUseConsecutive(false); disabledFilters.push("Consecutive Repeats"); }
                if ((failedFilterCounts.group / successfulDrawsInFinalPool.length) > failureThreshold) { setFilterUseNumberGroups(false); disabledFilters.push("Number Groups"); }
                if ((failedFilterCounts.digitSum / successfulDrawsInFinalPool.length) > failureThreshold) { setFilterUseDigitSum(false); disabledFilters.push("Sum of Digits"); }
                if ((failedFilterCounts.rankSum / successfulDrawsInFinalPool.length) > failureThreshold) { setFilterUseRankSum(false); disabledFilters.push("Sum of Ranks"); }
                if ((failedFilterCounts.arithmetic / successfulDrawsInFinalPool.length) > failureThreshold) { setFilterUseArithmetic(false); disabledFilters.push("Arithmetic"); }
            }
            
            setPoolSize(bestPoolSizeForStrategy);
            const recommendedTickets = Math.round(10 * (5 / (maxSuccessfulDraws || 1)));
            const finalTickets = Math.max(5, Math.min(50, recommendedTickets));
            setNumSetsToGenerate(finalTickets);

            let finalMessage = `✅ Auto-Tune Complete!\n\n`;
            finalMessage += `Optimal Pool Size: ${bestPoolSizeForStrategy}\n`;
            finalMessage += `   - This pool achieved ${maxSuccessfulDraws}/10 draws with at least ${hitTarget} hits.\n`;
            finalMessage += `Recommended Tickets: ${finalTickets}\n`;
            if (disabledFilters.length > 0) {
                finalMessage += `Disabled Filters (for failing too often): ${disabledFilters.join(', ')}\n\n`;
            } else {
                finalMessage += `No filters were disabled as they all performed well.\n\n`;
            }
            finalMessage += `All settings have been updated automatically!`;
            setMessage(finalMessage);

        }, 100);
    }, [
        validDraws, selectedGame, calculateFrequencies, 
        setFilterLimitSequentials, setFilterCheckSimilarity, setFilterCheckBalance, 
        setFilterUseStatisticalSum, setFilterUsePositional, setFilterUseDelta, 
        setFilterUseLastDigits, setFilterUseConsecutive, setFilterUseNumberGroups,
        setFilterUseDigitSum, setFilterUseRankSum, setFilterUseArithmetic,
        setPoolSize, setNumSetsToGenerate,
        isBalancedOddEven, isBalancedHighLow, isSumWithinRange, isWithinPositionalBounds,
        isTooSimilar, isDeltaSumValid, hasValidLastDigitDistribution, hasValidConsecutiveRepeat,
        hasValidNumberGroupDistribution, isDigitSumWithinRange, isRankSumWithinRange,
        positionalStats, sumStats, deltaStats, lastDigitStats, digitSumStats, rankStats,
        recentSimilarityThreshold, similarityThreshold
    ]);

    const handleTrainAndGenerateAIPicks = useCallback(async (useSavedModel = false) => {
        setReductionAnalysis(null);
        if (!isTfLoaded) {
            setMessage("TensorFlow.js is still loading. Please wait a moment.");
            return;
        }
        if (validDraws.length < 50) { 
            setMessage("Please upload sufficient historical data (at least 50 draws) to train the AI model.");
            return;
        }
        
        setIsTraining(true);
        let model = null;
        const modelPath = `indexeddb://lottery-model-${selectedGame}`;

        if(useSavedModel) {
            try {
                setMessage("🧠 Loading saved AI model...");
                model = await window.tf.loadLayersModel(modelPath);
                setAiModel(model);
                setMessage("✅ Saved AI Model Loaded.");
            } catch (e) {
                setMessage("Could not find a saved model. Please train a new one.");
                setIsTraining(false);
                return;
            }
        }

        if(!model) {
            setMessage("🧠 Preparing data for AI model...");
            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                const gameInfo = gameProperties[selectedGame];
                const { range } = gameInfo;
                const numFeatures = 11; // Now using 11 features

                // 1. Feature Engineering
                const allFeatures = [];
                const allLabels = [];
                const lastDraw = validDraws[validDraws.length-1].main;

                for (let i = 20; i < validDraws.length; i++) {
                    const currentDraw = validDraws[i];
                    const historyBeforeDraw = validDraws.slice(0, i);
                    const recentHistory = historyBeforeDraw.slice(-20);

                    const freqs = calculateFrequencies(historyBeforeDraw, range);
                    const recentFreqs = calculateFrequencies(recentHistory, range);

                    for (let num = 1; num <= range; num++) {
                        const lastSeenIndex = historyBeforeDraw.slice().reverse().findIndex(d => d.main.includes(num));
                        
                        let avgPairScore = 0;
                        if(pairingStats[num]) {
                            let totalPairCount = 0;
                            let numPairs = 0;
                             for(let pairNum = 1; pairNum <= range; pairNum++) {
                                if(num !== pairNum && pairingStats[num][pairNum] > 0) {
                                    totalPairCount += pairingStats[num][pairNum];
                                    numPairs++;
                                }
                            }
                            if(numPairs > 0) {
                                avgPairScore = totalPairCount / numPairs;
                            }
                        }

                        const features = [
                            freqs[num] / historyBeforeDraw.length, 
                            lastSeenIndex === -1 ? 1.0 : lastSeenIndex / historyBeforeDraw.length,
                            recentFreqs[num] / recentHistory.length,
                            num % 2,
                            num > range / 2 ? 1 : 0,
                            (num % 10) / 9,
                            positionalStats.averages[num] / gameInfo.standardSize,
                            lastDraw.includes(num) ? 1 : 0,
                            avgPairScore / validDraws.length, // Normalized avg pairing score
                            gapStats.avgGaps[num] / validDraws.length, // Normalized avg gap
                            getDigitalRoot(num) / 9 // Normalized digital root
                        ];
                        allFeatures.push(...features);
                        allLabels.push(currentDraw.main.includes(num) ? 1 : 0);
                    }
                }
                
                const xs = window.tf.tensor2d(allFeatures, [allLabels.length, numFeatures]);
                const ys = window.tf.tensor2d(allLabels, [allLabels.length, 1]);

                // 2. Model Definition
                setMessage("🤖 Building Neural Network...");
                await new Promise(resolve => setTimeout(resolve, 100));

                const newModel = window.tf.sequential();
                newModel.add(window.tf.layers.dense({ inputShape: [numFeatures], units: 48, activation: 'relu' }));
                newModel.add(window.tf.layers.dense({ units: 24, activation: 'relu' }));
                newModel.add(window.tf.layers.dense({ units: 1, activation: 'sigmoid' }));

                newModel.compile({
                    optimizer: 'adam',
                    loss: 'binaryCrossentropy',
                    metrics: ['accuracy']
                });

                // 3. Model Training
                setMessage("🏋️ Training AI Model... This may take a few seconds.");
                await new Promise(resolve => setTimeout(resolve, 100));
                
                await newModel.fit(xs, ys, {
                    epochs: 10, 
                    batchSize: range,
                    callbacks: {
                        onEpochEnd: (epoch, logs) => {
                            const loss = logs.loss.toFixed(4);
                            setMessage(`🏋️ Training AI Model... Epoch ${epoch + 1}/10 | Loss: ${loss}`);
                        }
                    }
                });
                setAiModel(newModel);
                model = newModel;

            } catch (error) {
                console.error("AI Training Failed:", error);
                setMessage(`An error occurred during AI training: ${error.message}`);
                setIsTraining(false);
                return;
            }
        }

        // 4. Prediction
        setMessage("🔮 Generating AI predictions for the next draw...");
        await new Promise(resolve => setTimeout(resolve, 100));

        const gameInfo = gameProperties[selectedGame];
        const { range } = gameInfo;
        const numFeatures = 11;
        const predictionFeatures = [];
        const historyBeforeDraw = validDraws;
        const recentHistory = historyBeforeDraw.slice(-20);
        const freqs = calculateFrequencies(historyBeforeDraw, range);
        const recentFreqs = calculateFrequencies(recentHistory, range);
        const lastDraw = validDraws[validDraws.length-1].main;

        for (let num = 1; num <= range; num++) {
            const lastSeenIndex = historyBeforeDraw.slice().reverse().findIndex(d => d.main.includes(num));
            
            let avgPairScore = 0;
            if(pairingStats[num]) {
                let totalPairCount = 0;
                let numPairs = 0;
                 for(let pairNum = 1; pairNum <= range; pairNum++) {
                    if(num !== pairNum && pairingStats[num][pairNum] > 0) {
                        totalPairCount += pairingStats[num][pairNum];
                        numPairs++;
                    }
                }
                if(numPairs > 0) {
                    avgPairScore = totalPairCount / numPairs;
                }
            }

            const features = [
                freqs[num] / historyBeforeDraw.length,
                lastSeenIndex === -1 ? 1.0 : lastSeenIndex / historyBeforeDraw.length,
                recentFreqs[num] / recentHistory.length,
                num % 2,
                num > range / 2 ? 1 : 0,
                (num % 10) / 9,
                positionalStats.averages[num] / gameInfo.standardSize,
                lastDraw.includes(num) ? 1 : 0,
                avgPairScore / validDraws.length, 
                gapStats.avgGaps[num] / validDraws.length,
                getDigitalRoot(num) / 9
            ];
            predictionFeatures.push(...features);
        }

        const predictionTensor = window.tf.tensor2d(predictionFeatures, [range, numFeatures]);
        const predictionResult = model.predict(predictionTensor);
        const probabilities = await predictionResult.data();

        const numberProbabilities = [];
        for (let i = 0; i < probabilities.length; i++) {
            numberProbabilities.push({ number: i + 1, probability: probabilities[i] });
        }

        // 5. Generate Picks from AI Pool
        numberProbabilities.sort((a, b) => b.probability - a.probability);
        const aiPool = numberProbabilities.slice(0, poolSize).map(p => p.number);
        
        setMessage(`✅ AI Analysis Complete! Generating ${numSetsToGenerate} filtered set(s) from top AI choices...`);
        
        const allAIPicks = [];
        for (let i = 0; i < numSetsToGenerate; i++) {
            const aiPickSet = generateSinglePickSet(false, aiPool);
            if (aiPickSet) {
                allAIPicks.push(aiPickSet);
            }
        }

        if (allAIPicks.length > 0) {
            setGeneratedPicks(allAIPicks);
            let successMessage = `Successfully generated ${allAIPicks.length} sample(s) from the AI-filtered combination pool.`;
            if (allAIPicks.length < numSetsToGenerate) {
                successMessage += "\n(Could not generate all sets with the current filter settings and AI pool.)";
            }
            setMessage(successMessage);
        } else {
            setGeneratedPicks([]);
            setMessage("Could not generate any AI-powered picks. The AI's top choices may be too restrictive for the current filter settings. Try relaxing filters or increasing the pool size.");
        }

        setIsTraining(false);

    }, [isTfLoaded, validDraws, selectedGame, poolSize, generateSinglePickSet, numSetsToGenerate, positionalStats, calculateFrequencies, pairingStats, gapStats]);

    const handleSaveModel = useCallback(async () => {
        if (!aiModel) {
            setMessage("No AI model has been trained yet.");
            return;
        }
        const modelPath = `indexeddb://lottery-model-${selectedGame}`;
        try {
            await aiModel.save(modelPath);
            setMessage(`AI Model for ${selectedGame} saved successfully in your browser!`);
        } catch (e) {
            setMessage(`Error saving model: ${e.message}`);
        }
    }, [aiModel, selectedGame]);

    const handleCombinationReductionAnalysis = useCallback(async () => {
        if (validDraws.length === 0) {
            setMessage("Please upload historical data first.");
            return;
        }
        
        setMessage("🔬 Analyzing combination reduction... This may take a moment.");
        setGeneratedPicks([]);
        setReductionAnalysis(null);
        setIsTraining(true); // use isTraining to disable buttons

        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const gameInfo = gameProperties[selectedGame];
            const totalCombinations = combinations(gameInfo.range, gameInfo.standardSize);
            const sampleSize = 10000;
            const numberPool = Array.from({ length: gameInfo.range }, (_, i) => i + 1);
            
            const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            const twoYearsAgo = new Date(); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
            const lastYearDraws = validDraws.filter(draw => new Date(draw.date) >= oneYearAgo);
            const olderDraws = validDraws.filter(draw => new Date(draw.date) >= twoYearsAgo && new Date(draw.date) < oneYearAgo);
            const lastDrawNumbers = validDraws.length > 0 ? validDraws[validDraws.length - 1].main : null;

            let aiProbabilities = null;
            if (aiModel) {
                 const { range, standardSize } = gameInfo;
                 const numFeatures = 11;
                 const predictionFeatures = [];
                 const historyBeforeDraw = validDraws;
                 const recentHistory = historyBeforeDraw.slice(-20);
                 const freqs = calculateFrequencies(historyBeforeDraw, range);
                 const recentFreqs = calculateFrequencies(recentHistory, range);
                 const lastDraw = validDraws[validDraws.length-1].main;

                 for (let num = 1; num <= range; num++) {
                     const lastSeenIndex = historyBeforeDraw.slice().reverse().findIndex(d => d.main.includes(num));
                     let avgPairScore = 0;
                     if(pairingStats[num]) {
                         let totalPairCount = 0; let numPairs = 0;
                         for(let pairNum = 1; pairNum <= range; pairNum++) {
                             if(num !== pairNum && pairingStats[num][pairNum] > 0) {
                                 totalPairCount += pairingStats[num][pairNum];
                                 numPairs++;
                             }
                         }
                         if(numPairs > 0) { avgPairScore = totalPairCount / numPairs; }
                     }
                     const features = [
                         freqs[num] / historyBeforeDraw.length, lastSeenIndex === -1 ? 1.0 : lastSeenIndex / historyBeforeDraw.length,
                         recentFreqs[num] / recentHistory.length, num % 2, num > range / 2 ? 1 : 0, (num % 10) / 9,
                         positionalStats.averages[num] / standardSize, lastDraw.includes(num) ? 1 : 0,
                         avgPairScore / validDraws.length, gapStats.avgGaps[num] / validDraws.length, getDigitalRoot(num) / 9
                     ];
                     predictionFeatures.push(...features);
                 }
                 const predictionTensor = window.tf.tensor2d(predictionFeatures, [range, numFeatures]);
                 const predictionResult = aiModel.predict(predictionTensor);
                 aiProbabilities = await predictionResult.data();
            }

            let eliminationCounts = {
                sequential: 0, balance: 0, sum: 0, positional: 0,
                similarity: 0, delta: 0, lastDigit: 0, ai: 0,
                consecutive: 0, group: 0, digitSum: 0, rankSum: 0,
                arithmetic: 0
            };

            for (let i = 0; i < sampleSize; i++) {
                const shuffled = numberPool.sort(() => 0.5 - Math.random());
                const randomSet = shuffled.slice(0, gameInfo.standardSize).sort((a, b) => a - b);

                if (filterUseArithmetic && isArithmeticProgression(randomSet)) eliminationCounts.arithmetic++;
                else if (filterLimitSequentials && containsTooManySequentials(randomSet, 3)) eliminationCounts.sequential++;
                else if (filterCheckBalance && (!isBalancedOddEven(randomSet) || !isBalancedHighLow(randomSet, gameInfo.range))) eliminationCounts.balance++;
                else if (filterUseStatisticalSum && !isSumWithinRange(randomSet)) eliminationCounts.sum++;
                else if (filterUseDigitSum && !isDigitSumWithinRange(randomSet)) eliminationCounts.digitSum++;
                else if (filterUseRankSum && !isRankSumWithinRange(randomSet)) eliminationCounts.rankSum++;
                else if (filterUsePositional && !isWithinPositionalBounds(randomSet, positionalStats.bounds)) eliminationCounts.positional++;
                else if (filterCheckSimilarity && (isTooSimilar(randomSet, lastYearDraws, recentSimilarityThreshold) || isTooSimilar(randomSet, olderDraws, similarityThreshold))) eliminationCounts.similarity++;
                else if (filterUseDelta && !isDeltaSumValid(randomSet, deltaStats)) eliminationCounts.delta++;
                else if (filterUseLastDigits && !hasValidLastDigitDistribution(randomSet, lastDigitStats)) eliminationCounts.lastDigit++;
                else if (filterUseConsecutive && !hasValidConsecutiveRepeat(randomSet, lastDrawNumbers)) eliminationCounts.consecutive++;
                else if (filterUseNumberGroups && !hasValidNumberGroupDistribution(randomSet, gameInfo.range)) eliminationCounts.group++;
                else if (aiModel && aiProbabilities) {
                    const comboProb = randomSet.reduce((prod, num) => prod * aiProbabilities[num - 1], 1);
                    const threshold = 1e-10; // Example threshold, could be dynamic
                    if (comboProb < threshold) eliminationCounts.ai++;
                }
            }

            const analysisSteps = [];
            let remainingCombs = totalCombinations;

            const processFilter = (filterName, count, isEnabled) => {
                if (isEnabled) {
                    const reduction = remainingCombs * (count / sampleSize);
                    remainingCombs -= reduction;
                    analysisSteps.push({ filter: filterName, remaining: Math.round(remainingCombs) });
                }
            };
            
            processFilter('Arithmetic', eliminationCounts.arithmetic, filterUseArithmetic);
            processFilter('Sequential', eliminationCounts.sequential, filterLimitSequentials);
            processFilter('Balance', eliminationCounts.balance, filterCheckBalance);
            processFilter('Statistical Sum', eliminationCounts.sum, filterUseStatisticalSum);
            processFilter('Sum of Digits', eliminationCounts.digitSum, filterUseDigitSum);
            processFilter('Sum of Ranks', eliminationCounts.rankSum, filterUseRankSum);
            processFilter('Positional', eliminationCounts.positional, filterUsePositional);
            processFilter('Similarity', eliminationCounts.similarity, filterCheckSimilarity);
            processFilter('Delta System', eliminationCounts.delta, filterUseDelta);
            processFilter('Last Digits', eliminationCounts.lastDigit, filterUseLastDigits);
            processFilter('Consecutive Repeats', eliminationCounts.consecutive, filterUseConsecutive);
            processFilter('Number Groups', eliminationCounts.group, filterUseNumberGroups);
            processFilter('AI Analysis', eliminationCounts.ai, !!aiModel);

            setReductionAnalysis({
                initial: totalCombinations,
                steps: analysisSteps,
                final: Math.round(remainingCombs),
                eliminationPercent: (1 - (remainingCombs / totalCombinations)) * 100
            });
            setMessage("✅ Combination Reduction Analysis Complete!");

        } catch (error) {
            console.error("Reduction Analysis Failed:", error);
            setMessage(`An error occurred during analysis: ${error.message}`);
        } finally {
            setIsTraining(false);
        }
    }, [validDraws, selectedGame, aiModel, filterLimitSequentials, filterCheckBalance, filterUseStatisticalSum, filterUsePositional, filterCheckSimilarity, filterUseDelta, filterUseLastDigits, positionalStats, sumStats, deltaStats, lastDigitStats, recentSimilarityThreshold, similarityThreshold, filterUseConsecutive, filterUseNumberGroups, filterUseDigitSum, digitSumStats, filterUseRankSum, rankStats, filterUseArithmetic, isRankSumWithinRange, isDigitSumWithinRange, isSumWithinRange, isBalancedOddEven, isBalancedHighLow, isWithinPositionalBounds, isDeltaSumValid, hasValidLastDigitDistribution, hasValidConsecutiveRepeat, hasValidNumberGroupDistribution, calculateFrequencies, pairingStats, gapStats]);

    const handleGameChange = useCallback((event) => {
        const newGame = event.target.value;
        setSelectedGame(newGame);
        setGeneratedPicks([]);
        setMessage('');
        setAiModel(null); 
        setReductionAnalysis(null);
    }, []);

    const showFilterDescription = (filterKey, filterName) => {
        setPopupContent({
            show: true,
            title: `${filterName} Filter`,
            description: filterDescriptions[filterKey]
        });
    };

    const copyToClipboard = useCallback((text) => {
        if (!text) {
            if (generatedPicks.length === 0) {
                setMessage('No numbers to copy.');
                return;
            }
            text = generatedPicks.map((pickSet, index) => {
                let line = `Set ${index + 1}: ${pickSet.main.join(', ')}`;
                if (pickSet.grand) {
                    line += ` Grand: ${pickSet.grand}`;
                }
                return line;
            }).join('\n');
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        try {
            textarea.select();
            document.execCommand('copy');
            setMessage('Copied to clipboard!');
        } catch (err) {
            setMessage('Failed to copy.');
            console.error('Copy failed:', err);
        } finally {
            document.body.removeChild(textarea);
        }
    }, [generatedPicks]);

    const FilterLabel = ({ filterKey, filterName, checked, onChange, disabled = false }) => (
        <label className={`inline-flex items-center ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input type="checkbox" className="form-checkbox h-5 w-5 text-red-600 rounded bg-gray-100 border-gray-400 focus:ring-red-500" checked={checked} onChange={onChange} disabled={disabled} />
            <span 
                className={`ml-2 text-gray-700 ${disabled ? '' : 'cursor-pointer hover:text-red-600'}`}
                onClick={() => !disabled && showFilterDescription(filterKey, filterName)}
            >
                {filterName}
            </span>
        </label>
    );

    return (
        <div className="min-h-screen bg-gray-700 text-white flex flex-col items-center p-4 font-sans">
            {popupContent.show && (
                <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white border border-gray-300 p-6 rounded-xl shadow-2xl max-w-md w-full text-gray-800">
                        <h3 className="text-xl font-bold text-red-600 mb-3">{popupContent.title}</h3>
                        <p className="text-gray-700 mb-6">{popupContent.description}</p>
                        <button 
                            onClick={() => setPopupContent({ show: false, title: '', description: '' })}
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
            {showPayouts && (
                <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white border border-gray-300 p-6 rounded-xl shadow-2xl max-w-lg w-full text-gray-800">
                        <h3 className="text-2xl font-bold text-red-600 mb-4 capitalize">{selectedGame.replace(/([A-Z])/g, ' $1')} Payouts</h3>
                        <div className="overflow-y-auto max-h-[60vh]">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="p-3">Match</th>
                                        <th className="p-3">Prize</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(payoutTables[selectedGame]).map(([match, prize]) => (
                                        <tr key={match} className="border-b border-gray-200">
                                            <td className="p-3 font-semibold">{match}</td>
                                            <td className="p-3">{prize}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <button 
                            onClick={() => setShowPayouts(false)}
                            className="w-full mt-6 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-gray-200/90 backdrop-filter backdrop-blur-lg p-6 md:p-8 rounded-2xl shadow-xl w-full max-w-4xl mb-8 border border-gray-400 text-gray-800">
                <h1 className="text-4xl font-extrabold text-gray-900 mb-6 text-center drop-shadow-lg" style={{textShadow: '1px 1px 3px rgba(0,0,0,0.2)'}}>Millionaire Maker</h1>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label htmlFor="gameSelect" className="block text-gray-700 text-sm font-bold mb-2">Lottery Game</label>
                        <div className="relative">
                            <select id="gameSelect" value={selectedGame} onChange={handleGameChange} className="block appearance-none w-full bg-white border-gray-300 text-gray-900 py-3 px-4 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                                <option value="dailyGrand">Daily Grand</option>
                                <option value="lottoMax">Lotto Max</option>
                                <option value="lotto649">Lotto 6/49</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                               <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">Database Status</label>
                        <div className="bg-white border-gray-300 text-gray-900 py-3 px-4 rounded-lg shadow-sm">
                            {isLoading ? 'Connecting to database...' : `Connected. ${validDraws.length} draws loaded.`}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                     <div>
                        <label htmlFor="numSets" className="block text-gray-700 text-sm font-bold mb-2">Samples to Generate</label>
                        <input id="numSets" type="number" min="1" max="50" value={numSetsToGenerate} onChange={(e) => setNumSetsToGenerate(Math.max(1, Math.min(50, Number(e.target.value))))} className="block w-full bg-white border-gray-300 text-gray-900 py-3 px-4 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                    </div>
                    <div>
                        <label htmlFor="poolSize" className="block text-gray-700 text-sm font-bold mb-2">Pool Size</label>
                        <input id="poolSize" type="number" min="10" max="49" value={poolSize} onChange={(e) => setPoolSize(Math.max(10, Math.min(49, Number(e.target.value))))} className="block w-full bg-white border-gray-300 text-gray-900 py-3 px-4 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                    </div>
                    <div>
                        <label htmlFor="recentSimilarity" className="block text-gray-700 text-sm font-bold mb-2">Recent Similarity %</label>
                        <input id="recentSimilarity" type="number" min="0" max="100" value={recentSimilarityThreshold} onChange={(e) => setRecentSimilarityThreshold(Number(e.target.value))} className="block w-full bg-white border-gray-300 text-gray-900 py-3 px-4 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                    </div>
                    <div>
                        <label htmlFor="olderSimilarity" className="block text-gray-700 text-sm font-bold mb-2">Older Similarity %</label>
                        <input id="olderSimilarity" type="number" min="0" max="100" value={similarityThreshold} onChange={(e) => setSimilarityThreshold(Number(e.target.value))} className="block w-full bg-white border-gray-300 text-gray-900 py-3 px-4 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                    </div>
                </div>
                
                <div className="mb-6">
                    <label htmlFor="poolStrategy" className="block text-gray-700 text-sm font-bold mb-2">Pool Generation Strategy</label>
                    <select id="poolStrategy" value={poolStrategy} onChange={(e) => setPoolStrategy(e.target.value)} className="block appearance-none w-full bg-white border-gray-300 text-gray-900 py-3 px-4 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                        <option value="dynamic">Dynamic Weighted (Recommended)</option>
                        <option value="frequency">Frequency Based</option>
                    </select>
                </div>


                <div className="mb-6 border-t border-gray-200 pt-4">
                    <h2 className="text-xl font-bold text-gray-800 mb-3">Elimination Filters</h2>
                     <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 text-sm">
                        <FilterLabel filterKey="similarity" filterName="Similarity" checked={filterCheckSimilarity} onChange={(e) => setFilterCheckSimilarity(e.target.checked)} />
                        <FilterLabel filterKey="sequentials" filterName="Sequentials" checked={filterLimitSequentials} onChange={(e) => setFilterLimitSequentials(e.target.checked)} />
                        <FilterLabel filterKey="balance" filterName="Balance" checked={filterCheckBalance} onChange={(e) => setFilterCheckBalance(e.target.checked)} />
                        <FilterLabel filterKey="sumRange" filterName="Sum Range" checked={filterUseStatisticalSum} onChange={(e) => setFilterUseStatisticalSum(e.target.checked)} disabled={!sumStats} />
                        <FilterLabel filterKey="positional" filterName="Positional" checked={filterUsePositional} onChange={(e) => setFilterUsePositional(e.target.checked)} disabled={!positionalStats.bounds} />
                        <FilterLabel filterKey="delta" filterName="Delta System" checked={filterUseDelta} onChange={(e) => setFilterUseDelta(e.target.checked)} disabled={!deltaStats} />
                        <FilterLabel filterKey="lastDigits" filterName="Last Digits" checked={filterUseLastDigits} onChange={(e) => setFilterUseLastDigits(e.target.checked)} disabled={!lastDigitStats} />
                        <FilterLabel filterKey="consecutiveRepeats" filterName="Consecutive Repeats" checked={filterUseConsecutive} onChange={(e) => setFilterUseConsecutive(e.target.checked)} disabled={validDraws.length < 2} />
                        <FilterLabel filterKey="numberGroups" filterName="Number Groups" checked={filterUseNumberGroups} onChange={(e) => setFilterUseNumberGroups(e.target.checked)} disabled={!validDraws.length} />
                        <FilterLabel filterKey="digitSum" filterName="Sum of Digits" checked={filterUseDigitSum} onChange={(e) => setFilterUseDigitSum(e.target.checked)} disabled={!digitSumStats} />
                        <FilterLabel filterKey="rankSum" filterName="Sum of Ranks" checked={filterUseRankSum} onChange={(e) => setFilterUseRankSum(e.target.checked)} disabled={!rankStats} />
                        <FilterLabel filterKey="arithmetic" filterName="Arithmetic" checked={filterUseArithmetic} onChange={(e) => setFilterUseArithmetic(e.target.checked)} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <button onClick={handleStrategicAutoTune} disabled={isTraining || isLoading || !validDraws.length} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-transform transform hover:scale-105">Auto-Tune Strategy</button>
                    <button onClick={handleGenerateFilteredSamples} disabled={isTraining || isLoading || !validDraws.length} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-transform transform hover:scale-105">Generate Filtered Samples</button>
                    <button onClick={handleAnalyzePastDraws} disabled={isTraining || isLoading || !validDraws.length} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-transform transform hover:scale-105">Analyze Past Draws</button>
                    <button onClick={() => handleTrainAndGenerateAIPicks(false)} disabled={!isTfLoaded || isTraining || isLoading || validDraws.length < 50} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-transform transform hover:scale-105">{isTraining ? 'AI is Working...' : 'Train & Generate AI Picks'}</button>
                    <button onClick={() => handleTrainAndGenerateAIPicks(true)} disabled={!isTfLoaded || isTraining || isLoading || !validDraws.length} className="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3 px-4 rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-transform transform hover:scale-105">Use Saved AI & Generate</button>
                    <button onClick={handleSaveModel} disabled={isTraining || !aiModel} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-transform transform hover:scale-105">Save Trained AI Model</button>
                    <div className="md:col-span-3">
                        <button onClick={handleCombinationReductionAnalysis} disabled={isTraining || isLoading || !validDraws.length} className="w-full bg-red-800 hover:bg-red-900 text-white font-bold py-3 px-4 rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-transform transform hover:scale-105">Analyze Combination Reduction</button>
                    </div>
                </div>
            </div>

            {(message || reductionAnalysis) && (
                <div className="bg-gray-200/90 p-6 rounded-xl shadow-xl w-full max-w-4xl mt-4 border border-gray-400">
                    <p className="text-red-600 mb-4 text-center whitespace-pre-wrap font-semibold">{message}</p>
                    
                    {reductionAnalysis && (
                        <div className="mt-4 text-sm">
                            <h3 className="text-xl font-bold text-center text-red-600 mb-4">Combination Reduction Breakdown</h3>
                            <div className="bg-white/50 p-4 rounded-lg">
                                <div className="flex justify-between items-baseline border-b-2 border-gray-200 pb-2 mb-2">
                                    <span className="font-bold text-gray-700">Total Possible Combinations:</span>
                                    <span className="font-mono text-lg text-gray-900">{reductionAnalysis.initial.toLocaleString()}</span>
                                </div>
                                {reductionAnalysis.steps.map((step, index) => (
                                    <div key={index} className="flex justify-between items-baseline py-1 text-gray-600">
                                        <span>After '{step.filter}' Filter:</span>
                                        <span className="font-mono text-gray-800">{step.remaining.toLocaleString()}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between items-baseline border-t-2 border-gray-200 pt-2 mt-2">
                                    <span className="font-bold text-lg text-red-600">Estimated Valid Pool:</span>
                                    <span className="font-mono text-xl font-bold text-gray-900">{reductionAnalysis.final.toLocaleString()}</span>
                                </div>
                                <div className="text-center mt-3 text-lg font-bold text-red-700">
                                    {reductionAnalysis.eliminationPercent.toFixed(2)}% of combinations eliminated
                                </div>
                            </div>
                        </div>
                    )}

                    {Array.isArray(generatedPicks) && generatedPicks.length > 0 && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                {generatedPicks.map((pickSet, setIndex) => (
                                    <div key={`set-${setIndex}`} className="bg-white p-4 rounded-lg shadow-inner">
                                        <p className="text-gray-800 font-semibold mb-2">Set {setIndex + 1}:</p>
                                        <div className="flex flex-wrap justify-center gap-2 mb-2">
                                            {pickSet.main.map((pick, numIndex) => (
                                                <span key={`pick-${numIndex}`} className="bg-red-600 text-white text-xl font-bold rounded-full w-12 h-12 flex items-center justify-center shadow-md">{pick}</span>
                                            ))}
                                        </div>
                                        {pickSet.grand && (
                                            <div className="flex justify-center mt-2">
                                                 <span className="text-sm text-gray-500 mr-2">Grand:</span>
                                                <span className="bg-gray-600 text-white text-xl font-bold rounded-full w-12 h-12 flex items-center justify-center shadow-md">{pickSet.grand}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <button 
                                onClick={() => copyToClipboard(null)} 
                                className="w-full mt-4 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out"
                            >
                                Copy Numbers
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default App;
