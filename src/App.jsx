import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { createChart, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase connection
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Shared Master Color Palette for Trade Cycles
const CYCLE_COLORS = [
  { bg: '#e3f2fd', border: '#1976d2' }, 
  { bg: '#f3e5f5', border: '#7b1fa2' }, 
  { bg: '#fff3e0', border: '#f57c00' }, 
  { bg: '#e8f5e9', border: '#388e3c' }, 
  { bg: '#ffebee', border: '#d32f2f' }, 
  { bg: '#e0f7fa', border: '#0097a7' }, 
];

// --- Technical Analysis Helper Functions ---
function calculateSMA(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateRSI(data, period) {
  if (data.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = data.length - period; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// --- Headline Sentiment Analyzer ---
function analyzeSentiment(headlines) {
  if (!headlines || headlines.length === 0) return { label: 'Neutral', color: '#555' };
  
  const positiveWords = ['surge', 'jump', 'up', 'bull', 'beat', 'upgrade', 'higher', 'growth', 'gain', 'buy', 'strong', 'outperform', 'soar', 'record'];
  const negativeWords = ['plunge', 'drop', 'down', 'bear', 'miss', 'downgrade', 'lower', 'loss', 'sell', 'weak', 'underperform', 'cut', 'fall', 'sink'];
  
  let score = 0;
  headlines.forEach(headline => {
    const text = headline.toLowerCase();
    positiveWords.forEach(w => { if (text.includes(w)) score++; });
    negativeWords.forEach(w => { if (text.includes(w)) score--; });
  });

  if (score >= 2) return { label: 'Bullish', color: '#2e7d32' };
  if (score <= -2) return { label: 'Bearish', color: '#c62828' };
  if (score === 1) return { label: 'Slightly Bullish', color: '#4caf50' };
  if (score === -1) return { label: 'Slightly Bearish', color: '#ef5350' };
  return { label: 'Neutral', color: '#555' };
}

// --- Operational News Filter & Outlook Analysis ---
const FINANCIAL_JARGON = [
  'stock', 'share', 'price target', 'buy', 'sell', 'hold', 'rating', 'analyst', 
  'downgrade', 'upgrade', 'wall street', 'dividend', 'investor', 'bull', 'bear', 
  'nasdaq', 'nyse', 'chart', 'trade', 'technical', 'outperform', 'underperform', 
  'yield', 'earnings estimate', 'zacks', 'motley fool', 'price objective', 'equities'
];

function filterOperationalNews(newsItems) {
  return newsItems.filter(item => {
    const text = (item.title + " " + (item.description || "")).toLowerCase();
    const hasFinancialJargon = FINANCIAL_JARGON.some(term => text.includes(term));
    return !hasFinancialJargon;
  });
}

function generateOutlookAnalysis(ticker, newsItems) {
  if (!newsItems || newsItems.length === 0) {
    return `We couldn't find recent operational or product-specific news for ${ticker}. The current news cycle appears to be dominated by financial performance reporting or market speculation, which our engine has intentionally filtered out to give you a clear view of business operations.`;
  }

  let analysis = `Based on recent operational news, ${ticker}'s near-term fundamental outlook is driven by several key developments. `;
  
  const textCorpus = newsItems.map(n => n.title.toLowerCase()).join(" ");
  
  let themes = [];
  if (textCorpus.includes('launch') || textCorpus.includes('release') || textCorpus.includes('new product') || textCorpus.includes('announce')) {
    themes.push("rolling out new products and services");
  }
  if (textCorpus.includes('partner') || textCorpus.includes('collaborat') || textCorpus.includes('deal') || textCorpus.includes('pact') || textCorpus.includes('join forces')) {
    themes.push("forging strategic partnerships");
  }
  if (textCorpus.includes('acquir') || textCorpus.includes('buyout') || textCorpus.includes('merger')) {
    themes.push("expanding through M&A activity");
  }
  if (textCorpus.includes('sue') || textCorpus.includes('lawsuit') || textCorpus.includes('court') || textCorpus.includes('probe') || textCorpus.includes('investigat')) {
    themes.push("navigating active legal or regulatory challenges");
  }
  if (textCorpus.includes('layoff') || textCorpus.includes('cut') || textCorpus.includes('restructur') || textCorpus.includes('resign') || textCorpus.includes('ceo')) {
    themes.push("undergoing internal restructuring or leadership changes");
  }
  if (textCorpus.includes('compet') || textCorpus.includes('rival') || textCorpus.includes('vs')) {
    themes.push("facing active shifts in its competitive landscape");
  }
  if (textCorpus.includes('patent') || textCorpus.includes('trial') || textCorpus.includes('fda') || textCorpus.includes('r&d')) {
    themes.push("advancing key R&D initiatives");
  }

  if (themes.length > 0) {
    analysis += `The company's management is currently focused on ${themes.join(", and ")}. `;
  } else {
    analysis += `The company is maintaining its core operational trajectory without major structural shifts in the recent news cycle. `;
  }

  analysis += `Overall, the focus remains firmly on executing fundamental business operations and product roadmap delivery rather than immediate market fluctuations.`;

  return analysis;
}
// ------------------------------------------------

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);

  const [trades, setTrades] = useState([]);
  const [analyzedTrades, setAnalyzedTrades] = useState([]);
  
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [tickerStats, setTickerStats] = useState({}); 
  const [dayOfWeekStats, setDayOfWeekStats] = useState({}); 
  const [monthlyStats, setMonthlyStats] = useState({}); 
  const [showClosedPositions, setShowClosedPositions] = useState(true);
  
  const [technicalOutlook, setTechnicalOutlook] = useState(null);
  const [newsData, setNewsData] = useState({ ticker: [], market: [], sentiment: null, isLoading: false, hasError: false });

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [historyFilter, setHistoryFilter] = useState('All');
  const [portfolioFilter, setPortfolioFilter] = useState('All');
  const [riskPrices, setRiskPrices] = useState({});
  const [tradeNotes, setTradeNotes] = useState({});

  const [accountEquity, setAccountEquity] = useState(() => localStorage.getItem('trade_journal_equity') || '');

  const [advancedStats, setAdvancedStats] = useState({
    maxDD: 0, maxWinStreak: 0, maxLossStreak: 0, avgWinDays: 0, avgLossDays: 0
  });

  const [activeTab, setActiveTab] = useState('chart');

  const chartContainerRef = useRef();
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const markersRef = useRef(null); 

  const [isCalcModalOpen, setIsCalcModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFormat, setUploadFormat] = useState('IB'); 
  
  const [isOutlookModalOpen, setIsOutlookModalOpen] = useState(false);
  const [outlookTicker, setOutlookTicker] = useState('');
  const [outlookIsFetching, setOutlookIsFetching] = useState(false);
  const [outlookResults, setOutlookResults] = useState(null); 

  const [calcMode, setCalcMode] = useState('position');
  const [calcTicker, setCalcTicker] = useState('');
  const [calcTotalCapital, setCalcTotalCapital] = useState('');
  const [calcPositionPct, setCalcPositionPct] = useState('');
  const [calcRiskPct, setCalcRiskPct] = useState(''); 
  const [calcEntryPrice, setCalcEntryPrice] = useState('');
  const [calcStopLoss, setCalcStopLoss] = useState('');
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [calcHighOfDay, setCalcHighOfDay] = useState(null); 
  const [calcLowOfDay, setCalcLowOfDay] = useState(null); 

  useEffect(() => { localStorage.setItem('trade_journal_equity', accountEquity); }, [accountEquity]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (passwordInput === import.meta.env.VITE_APP_PASSWORD) {
      setIsAuthenticated(true); setAuthError(false);
    } else {
      setAuthError(true); setPasswordInput('');
    }
  };

  const fetchStopsFromDB = async () => {
    try {
      const { data, error } = await supabase.from('active_stops').select('*');
      if (error) throw error;
      if (data) {
        const stopsObj = {};
        data.forEach(row => { stopsObj[row.position_id] = row.stop_price; });
        setRiskPrices(stopsObj);
      }
    } catch (error) { console.error("Error fetching stops from DB:", error.message); }
  };

  const fetchNotesFromDB = async () => {
    try {
      const { data, error } = await supabase.from('trade_notes').select('*');
      if (error) throw error;
      if (data) {
        const notesObj = {};
        data.forEach(row => { notesObj[row.position_id] = row.note; });
        setTradeNotes(notesObj);
      }
    } catch (error) { console.error("Error fetching notes from DB:", error.message); }
  };

  const fetchTradesFromDB = async () => {
    try {
      let query = supabase.from('trades').select('*');
      if (startDate) query = query.gte('trade_date', startDate);
      if (endDate) query = query.lte('trade_date', endDate);
      const { data, error } = await query;
      if (error) throw error;

      const formattedTrades = data.map(row => ({
        formattedDate: row.trade_date, ticker: row.ticker, 'buy/sell': row.action, price: Number(row.price), quantity: Number(row.quantity)
      })).sort((a, b) => {
        const dateA = new Date(a.formattedDate); const dateB = new Date(b.formattedDate);
        if (dateA.getTime() === dateB.getTime()) {
          if (a['buy/sell'] === 'buy' && b['buy/sell'] === 'sell') return -1;
          if (a['buy/sell'] === 'sell' && b['buy/sell'] === 'buy') return 1;
          return 0;
        }
        return dateA - dateB;
      });
      setTrades(formattedTrades);
    } catch (error) { console.error("Error fetching from DB:", error.message); }
  };

  useEffect(() => { if (isAuthenticated) { fetchTradesFromDB(); fetchStopsFromDB(); fetchNotesFromDB(); } }, [startDate, endDate, isAuthenticated]);

  const syncStopPrice = async (posId, price) => {
    const val = parseFloat(price);
    try {
      if (!isNaN(val)) await supabase.from('active_stops').upsert({ position_id: posId, stop_price: val });
      else await supabase.from('active_stops').delete().eq('position_id', posId);
    } catch (error) { console.error("Network or code error:", error.message); }
  };

  const syncTradeNote = async (posId, note) => {
    try {
      if (!note || note.trim() === '') await supabase.from('trade_notes').delete().eq('position_id', posId);
      else await supabase.from('trade_notes').upsert({ position_id: posId, note: note });
    } catch (error) { console.error("Network or code error:", error.message); }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const isStandard = uploadFormat === 'Standard';

    Papa.parse(file, {
      header: isStandard, 
      skipEmptyLines: true,
      transformHeader: function(h) {
        return isStandard ? h.trim().replace(/^\uFEFF/, '') : h;
      },
      complete: async (results) => {
        try {
          let dbTrades = [];

          if (uploadFormat === 'IB') {
            const rows = results.data;
            const filteredRows = rows.filter(row => 
              row[0] === 'Transaction History' && 
              row[1] === 'Data' && 
              (row[5] === 'Buy' || row[5] === 'Sell') && 
              row[6] && row[6].trim().length < 6
            );

            dbTrades = filteredRows.map(row => {
              const rawDate = row[2].replace(/-/g, '');
              const formattedDate = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
              
              let ticker = row[6].trim();
              const currency = row[9] ? row[9].trim() : '';
              
              if (currency === 'CAD' && !ticker.includes('.')) {
                ticker = `${ticker}.TO`;
              }

              return {
                trade_date: formattedDate,
                ticker: ticker,
                action: row[5].toLowerCase().trim(),
                price: parseFloat(row[8]),
                quantity: Math.abs(parseInt(row[7], 10)) 
              };
            });

          } else if (uploadFormat === 'Questrade') {
            alert("Questrade parsing logic coming soon! Please provide a sample file.");
            setIsUploadModalOpen(false);
            event.target.value = null;
            return;

          } else {
            dbTrades = results.data
              .filter(trade => trade.date && trade.ticker) 
              .map((trade) => {
                const dateStr = String(trade.date).trim();
                const formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
                
                return { 
                  trade_date: formattedDate, 
                  ticker: trade.ticker.trim(), 
                  action: trade['buy/sell'] ? trade['buy/sell'].toLowerCase().trim() : '', 
                  price: parseFloat(trade.price), 
                  quantity: Math.abs(parseInt(trade.quantity, 10)) 
                };
            });
          }

          if (dbTrades.length === 0) {
            alert(`No valid trades found for the ${uploadFormat} format.`);
            event.target.value = null;
            return;
          }

          const uniqueDates = [...new Set(dbTrades.map(trade => trade.trade_date))];
          await supabase.from('trades').delete().in('trade_date', uniqueDates);
          
          const { error } = await supabase.from('trades').insert(dbTrades);
          if (error) throw error;
          
          alert("Trades successfully synced!"); 
          fetchTradesFromDB(); 
          setIsUploadModalOpen(false);

        } catch (error) { 
          console.error("Upload error:", error);
          alert("Failed to process the file. Check your browser console for details."); 
        }
        event.target.value = null; 
      }
    });
  };

  const handleExportCSV = () => {
    if (Object.keys(tickerStats).length === 0) { alert("No data available to export."); return; }
    const exportData = Object.values(tickerStats).sort((a, b) => a.ticker.localeCompare(b.ticker) || a.positionNum - b.positionNum).map(stat => {
        const isClosed = stat.qty === 0;
        const breakEvenPrice = !isClosed ? (stat.avgCost - (stat.realizedPL / stat.qty)) : null;
        const breakEvenPct = !isClosed && stat.currentPrice > 0 ? ((breakEvenPrice / stat.currentPrice) - 1) * 100 : null;
        const currentR = (!isClosed && stat.avgCost > 0 && stat.currentPrice > 0) ? ((stat.currentPrice / stat.avgCost - 1) / 0.02) : null;
        
        return {
          "Ticker": stat.ticker, "Cycle #": stat.positionNum, "Status": isClosed ? "CLOSED" : "OPEN", "Remaining Qty": stat.qty,
          "Avg Entry Price": stat.avgCost.toFixed(2), "Net Realized P/L ($)": stat.realizedPL.toFixed(2), "Open P/L ($)": stat.qty > 0 ? stat.openPL.toFixed(2) : "0.00",
          "Break-Even Price": breakEvenPrice !== null ? breakEvenPrice.toFixed(2) : "N/A",
          "Break-Even %": breakEvenPct !== null ? breakEvenPct.toFixed(2) + '%' : "N/A",
          "Current R": currentR !== null ? currentR.toFixed(2) : "N/A",
          "Gross Profit ($)": stat.grossProfit.toFixed(2), "Gross Loss ($)": stat.grossLoss.toFixed(2), "Win %": stat.tradesClosed > 0 ? ((stat.winningTrades / stat.tradesClosed) * 100).toFixed(0) + '%' : "N/A",
          "Total Trades in Cycle": stat.tradesClosed, "Stop Price": riskPrices[stat.id] || "None", "Trade Journal Notes": tradeNotes[stat.id] || ""
        };
    });
    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.setAttribute("download", `trade_journal_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleFetchOutlook = async () => {
    if (!outlookTicker) return;
    setOutlookIsFetching(true);
    setOutlookResults(null);
    try {
      const tkr = outlookTicker.toUpperCase().trim();
      
      const query = `${tkr} AND (product OR launch OR partner OR competitor OR operations)`;
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`;
      
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error("Failed to fetch news");
      const xmlText = await res.text();
      
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      const itemNodes = xmlDoc.querySelectorAll("item");
      
      let items = Array.from(itemNodes).map(node => ({
        title: node.querySelector("title")?.textContent || "",
        link: node.querySelector("link")?.textContent || "",
        description: node.querySelector("description")?.textContent || "",
        publisher: node.querySelector("source")?.textContent || "News"
      }));
      
      items = filterOperationalNews(items);
      
      const uniqueItems = [];
      const seenTitles = new Set();
      for (let item of items) {
          const shortTitle = item.title.substring(0, 30).toLowerCase();
          if (!seenTitles.has(shortTitle)) {
            seenTitles.add(shortTitle);
            uniqueItems.push(item);
          }
      }

      const finalNews = uniqueItems.slice(0, 10); 
      const analysis = generateOutlookAnalysis(tkr, finalNews);

      setOutlookResults({
        news: finalNews,
        analysis: analysis
      });

    } catch(err) {
      console.error(err);
      setOutlookResults({ error: true });
    }
    setOutlookIsFetching(false);
  };

  useEffect(() => {
    if (trades.length === 0) {
      setTickerStats({}); setDayOfWeekStats({}); setMonthlyStats({}); setAnalyzedTrades([]); 
      setAdvancedStats({ maxDD: 0, maxWinStreak: 0, maxLossStreak: 0, avgWinDays: 0, avgLossDays: 0 });
      return;
    }

    const stats = {}; const mStats = {}; const positionCounters = {}; const enrichedTradesList = []; let realizedEvents = []; 
    
    trades.forEach(trade => {
      if (positionCounters[trade.ticker] === undefined) positionCounters[trade.ticker] = 1;
      const currentPosNum = positionCounters[trade.ticker];
      const posId = `${trade.ticker}-${currentPosNum}`;

      enrichedTradesList.push({ ...trade, positionNum: currentPosNum });

      if (!stats[posId]) {
        stats[posId] = { 
          id: posId, ticker: trade.ticker, positionNum: currentPosNum, qty: 0, totalCost: 0, realizedPL: 0, avgCost: 0, currentPrice: 0, openPL: 0,
          openLots: [], totalDaysHeld: 0, sharesClosed: 0, tradesClosed: 0, winningTrades: 0, losingTrades: 0, grossProfit: 0, grossLoss: 0, totalClosedCost: 0,
          winDays: 0, winShares: 0, lossDays: 0, lossShares: 0
        };
      }
      
      const s = stats[posId]; const tradeDate = new Date(trade.formattedDate);
      
      if (trade['buy/sell'] === 'buy') {
        s.qty += trade.quantity; s.totalCost += (trade.price * trade.quantity); s.avgCost = s.qty > 0 ? s.totalCost / s.qty : 0;
        s.openLots.push({ date: tradeDate, qty: trade.quantity });
      } else if (trade['buy/sell'] === 'sell') {
        const closedCost = s.avgCost * trade.quantity; const pl = trade.quantity * (trade.price - s.avgCost);
        s.realizedPL += pl; s.totalClosedCost += closedCost; s.qty -= trade.quantity; s.totalCost -= closedCost;
        if (s.qty === 0) { s.avgCost = 0; s.totalCost = 0; }
        s.tradesClosed++;
        if (pl > 0) { s.grossProfit += pl; s.winningTrades++; } else if (pl < 0) { s.grossLoss += Math.abs(pl); s.losingTrades++; }

        realizedEvents.push({ date: tradeDate, pl: pl }); 

        const yyyy = tradeDate.getFullYear(); const mm = String(tradeDate.getMonth() + 1).padStart(2, '0'); const monthKey = `${yyyy}-${mm}`; 
        if (!mStats[monthKey]) mStats[monthKey] = { monthKey, realizedPL: 0, grossProfit: 0, grossLoss: 0, tradesClosed: 0, winningTrades: 0, losingTrades: 0 };
        mStats[monthKey].realizedPL += pl; mStats[monthKey].tradesClosed++;
        if (pl > 0) { mStats[monthKey].grossProfit += pl; mStats[monthKey].winningTrades++; } 
        else if (pl < 0) { mStats[monthKey].grossLoss += Math.abs(pl); mStats[monthKey].losingTrades++; }

        let qtyToClose = trade.quantity;
        while (qtyToClose > 0 && s.openLots.length > 0) {
          let lot = s.openLots[0]; let closeQty = Math.min(qtyToClose, lot.qty); let daysHeld = (tradeDate - lot.date) / (1000 * 60 * 60 * 24);
          s.totalDaysHeld += (daysHeld * closeQty); s.sharesClosed += closeQty;
          if (pl > 0) { s.winDays += (daysHeld * closeQty); s.winShares += closeQty; } else if (pl < 0) { s.lossDays += (daysHeld * closeQty); s.lossShares += closeQty; }
          lot.qty -= closeQty; qtyToClose -= closeQty; if (lot.qty === 0) s.openLots.shift();
        }
        if (s.qty === 0) positionCounters[trade.ticker]++;
      }
    });

    setMonthlyStats(mStats); setAnalyzedTrades(enrichedTradesList);

    realizedEvents.sort((a, b) => a.date - b.date);
    let peak = 0; let maxDD = 0; let cumulative = 0; let curWin = 0, maxWinStreak = 0; let curLoss = 0, maxLossStreak = 0;
    realizedEvents.forEach(e => {
      cumulative += e.pl; if (cumulative > peak) peak = cumulative;
      let drawdown = peak - cumulative; if (drawdown > maxDD) maxDD = drawdown;
      if (e.pl > 0) { curWin++; maxWinStreak = Math.max(maxWinStreak, curWin); curLoss = 0; } 
      else if (e.pl < 0) { curLoss++; maxLossStreak = Math.max(maxLossStreak, curLoss); curWin = 0; }
    });

    let totalWinDays = 0, totalWinShares = 0; let totalLossDays = 0, totalLossShares = 0;
    Object.values(stats).forEach(s => { totalWinDays += s.winDays; totalWinShares += s.winShares; totalLossDays += s.lossDays; totalLossShares += s.lossShares; });
    const avgWinDays = totalWinShares > 0 ? (totalWinDays / totalWinShares).toFixed(1) : 0;
    const avgLossDays = totalLossShares > 0 ? (totalLossDays / totalLossShares).toFixed(1) : 0;
    setAdvancedStats({ maxDD, maxWinStreak, maxLossStreak, avgWinDays, avgLossDays });

    const fetchCurrentPrices = async () => {
      try {
        const openPositions = Object.values(stats).filter(stat => stat.qty > 0);
        const uniqueOpenTickers = [...new Set(openPositions.map(s => s.ticker))];
        for (let i = 0; i < uniqueOpenTickers.length; i++) {
          const ticker = uniqueOpenTickers[i];
          const fetchUrl = import.meta.env.PROD ? `/api/yahoo/${ticker}?interval=1d&range=5d` : `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`)}`;
          try {
            const res = await fetch(fetchUrl); const data = await res.json();
            if (data.chart && data.chart.result && data.chart.result.length > 0) {
              const quote = data.chart.result[0].indicators.quote[0]; const closes = quote.close.filter(c => c !== null && c !== undefined);
              if (closes.length > 0) {
                const latestClosePrice = closes[closes.length - 1];
                openPositions.forEach(stat => { if (stat.ticker === ticker) { stat.currentPrice = latestClosePrice; stat.openPL = (latestClosePrice - stat.avgCost) * stat.qty; } });
              }
            }
          } catch (error) {}
          setTickerStats({...stats}); await new Promise(r => setTimeout(r, 200));
        }
      } catch (error) {}
    };
    fetchCurrentPrices();
  }, [trades]);

  useEffect(() => {
    if (isAuthenticated && chartContainerRef.current && activeTab === 'chart') {
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth || 800, 
        height: 600,
        layout: { background: { color: '#ffffff' }, textColor: '#333', fontSize: 10 },
        grid: { vertLines: { color: '#eee' }, horzLines: { color: '#eee' } },
      });
      const candlestickSeries = chart.addSeries(CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
      chartRef.current = chart; seriesRef.current = candlestickSeries;
      return () => { chart.remove(); markersRef.current = null; };
    }
  }, [isAuthenticated, activeTab]);

  useEffect(() => {
    if (!selectedTicker || activeTab !== 'chart') return;
    
    const fetchMarketData = async () => {
      if (!seriesRef.current) return;
      const tickerTrades = analyzedTrades.filter((t) => t.ticker === selectedTicker);
      if (tickerTrades.length === 0) return;
      try {
        const fetchUrl = import.meta.env.PROD ? `/api/yahoo/${selectedTicker}?interval=1d&range=1y` : `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${selectedTicker}?interval=1d&range=1y`)}`;
        const response = await fetch(fetchUrl); const data = await response.json();
        if (data.chart && data.chart.result && data.chart.result.length > 0) {
          const result = data.chart.result[0]; const timestamps = result.timestamp; const quote = result.indicators.quote[0];
          const opens = quote.open, highs = quote.high, lows = quote.low, closes = quote.close;
          const realHistoricalData = []; const seenDates = new Set();
          
          for (let i = 0; i < timestamps.length; i++) {
            if (closes[i] !== null && closes[i] !== undefined) {
              const date = new Date(timestamps[i] * 1000); const formattedDate = date.toISOString().split('T')[0];
              if (!seenDates.has(formattedDate)) { 
                seenDates.add(formattedDate); 
                realHistoricalData.push({ time: formattedDate, open: opens[i], high: highs[i], low: lows[i], close: closes[i] }); 
              }
            }
          }
          realHistoricalData.sort((a, b) => new Date(a.time) - new Date(b.time)); 
          seriesRef.current.setData(realHistoricalData);
        }
        
        const markers = tickerTrades.map((trade) => {
          const colorIdx = (trade.positionNum - 1) % CYCLE_COLORS.length; const markerColor = CYCLE_COLORS[colorIdx].border;
          return { time: trade.formattedDate, position: trade['buy/sell'] === 'buy' ? 'belowBar' : 'aboveBar', color: markerColor, shape: trade['buy/sell'] === 'buy' ? 'arrowUp' : 'arrowDown', text: `${trade['buy/sell'] === 'buy' ? 'B' : 'S'} #${trade.positionNum}: ${trade.quantity}` };
        });
        markers.sort((a, b) => new Date(a.time) - new Date(b.time));
        if (!markersRef.current) markersRef.current = createSeriesMarkers(seriesRef.current, markers); else markersRef.current.setMarkers(markers);
      } catch (error) {}
    };

    fetchMarketData();
  }, [selectedTicker, analyzedTrades, activeTab]);

  const handleCalcTickerBlur = async () => {
    if (!calcTicker) return; setIsFetchingPrice(true); setCalcHighOfDay(null); setCalcLowOfDay(null);
    try {
      const ticker = calcTicker.toUpperCase();
      const fetchUrl = import.meta.env.PROD ? `/api/yahoo/${ticker}?interval=1d&range=5d` : `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`)}`;
      const res = await fetch(fetchUrl); const data = await res.json();
      if (data.chart && data.chart.result && data.chart.result.length > 0) {
        const quote = data.chart.result[0].indicators.quote[0];
        const closes = quote.close.filter(c => c !== null && c !== undefined); const highs = quote.high.filter(h => h !== null && h !== undefined); const lows = quote.low.filter(l => l !== null && l !== undefined);
        if (closes.length > 0) setCalcEntryPrice(closes[closes.length - 1].toFixed(2));
        if (highs.length > 0) setCalcHighOfDay(highs[highs.length - 1].toFixed(2));
        if (lows.length > 0) setCalcLowOfDay(lows[lows.length - 1].toFixed(2));
      }
    } catch (error) {} setIsFetchingPrice(false);
  };

  const parsedEquity = parseFloat(accountEquity) || 0;

  const statsArray = Object.values(tickerStats);
  const winningPositions = statsArray.filter(stat => stat.realizedPL > 0);
  const losingPositions = statsArray.filter(stat => stat.realizedPL < 0);
  
  const totalRealizedPL = statsArray.reduce((sum, stat) => sum + stat.realizedPL, 0);
  const grossProfit = winningPositions.reduce((sum, stat) => sum + stat.realizedPL, 0);
  const grossLoss = Math.abs(losingPositions.reduce((sum, stat) => sum + stat.realizedPL, 0));
  
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 'MAX' : '0.00') : (grossProfit / grossLoss).toFixed(2);
  const winRate = statsArray.length === 0 ? '0.0' : ((winningPositions.length / (winningPositions.length + losingPositions.length)) * 100).toFixed(1);

  const globalTotalDaysHeld = statsArray.reduce((sum, stat) => sum + stat.totalDaysHeld, 0);
  const globalSharesClosed = statsArray.reduce((sum, stat) => sum + stat.sharesClosed, 0);
  const globalAvgDaysHeld = globalSharesClosed > 0 ? (globalTotalDaysHeld / globalSharesClosed).toFixed(1) : 0;

  const totalInvested = statsArray.reduce((sum, stat) => sum + (stat.qty * stat.avgCost), 0);
  const totalPosPct = parsedEquity > 0 ? ((totalInvested / parsedEquity) * 100).toFixed(2) : '--';

  const totalOpenHeat = statsArray.reduce((sum, stat) => {
    if (stat.qty > 0) {
      const stopPrice = parseFloat(riskPrices[stat.id]);
      if (!isNaN(stopPrice) && stat.currentPrice > 0) return sum + ((stat.currentPrice - stopPrice) * stat.qty);
    }
    return sum;
  }, 0);

  const totalOpenRisk = statsArray.reduce((sum, stat) => {
    if (stat.qty > 0) {
      const stopPrice = parseFloat(riskPrices[stat.id]);
      if (!isNaN(stopPrice) && stat.avgCost > 0) return sum + ((stat.avgCost - stopPrice) * stat.qty);
    }
    return sum;
  }, 0);

  const globalRiskPct = parsedEquity > 0 && totalOpenRisk > 0 ? ((totalOpenRisk / parsedEquity) * 100).toFixed(2) : '--';

  const uniqueTickers = [...new Set(trades.map(t => t.ticker))].sort();

  const parsedTotalCapital = parseFloat(calcTotalCapital) || 0;
  const parsedPositionPct = parseFloat(calcPositionPct) || 0;
  const parsedRiskPct = parseFloat(calcRiskPct) || 0;
  const parsedEntryPrice = parseFloat(calcEntryPrice) || 0;
  const parsedStopLoss = parseFloat(calcStopLoss) || 0;

  let calcShares = 0; let calcCapitalAllocated = 0; let calcOpenRiskDollar = 0; let calcOpenRiskPct = 0; let calcPositionAllocPct = 0;

  if (calcMode === 'position') {
    calcCapitalAllocated = parsedTotalCapital * (parsedPositionPct / 100);
    calcShares = parsedEntryPrice > 0 ? Math.floor(calcCapitalAllocated / parsedEntryPrice) : 0;
    if (parsedEntryPrice > 0 && parsedStopLoss > 0 && parsedEntryPrice > parsedStopLoss) {
      calcOpenRiskDollar = calcShares * (parsedEntryPrice - parsedStopLoss);
      if (parsedTotalCapital > 0) calcOpenRiskPct = (calcOpenRiskDollar / parsedTotalCapital) * 100;
    }
    calcPositionAllocPct = parsedPositionPct;
  } else {
    if (parsedEntryPrice > 0 && parsedStopLoss > 0 && parsedEntryPrice > parsedStopLoss && parsedTotalCapital > 0) {
      calcOpenRiskDollar = parsedTotalCapital * (parsedRiskPct / 100);
      const riskPerShare = parsedEntryPrice - parsedStopLoss;
      calcShares = Math.floor(calcOpenRiskDollar / riskPerShare);
      calcCapitalAllocated = calcShares * parsedEntryPrice;
      calcPositionAllocPct = (calcCapitalAllocated / parsedTotalCapital) * 100;
      calcOpenRiskPct = parsedRiskPct;
    }
  }

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'sans-serif' }}>
        <form onSubmit={handleLogin} style={{ padding: '40px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '320px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
            <div style={{ width: '40px', height: '40px', backgroundColor: '#1565c0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </div>
          </div>
          <h2 style={{ margin: '0 0 25px 0', color: '#333' }}>Trade Visualizer</h2>
          <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="Enter Access Code" style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', fontSize: '14px' }} />
          {authError && <p style={{ color: '#d32f2f', fontSize: '13px', margin: '0 0 15px 0', fontWeight: 'bold' }}>Incorrect password.</p>}
          <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#1565c0', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: 'background-color 0.2s' }}>Access Dashboard</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
      
      {/* HEADER */}
      <div style={{ padding: '15px 20px', backgroundColor: '#f5f5f5', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <h2 style={{ margin: 0 }}>Trade Visualizer</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
          
          <button onClick={() => setIsCalcModalOpen(true)} style={{ padding: '8px 12px', backgroundColor: '#2e7d32', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="20"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>
            Calculator
          </button>

          {/* COMPANY OUTLOOK BUTTON */}
          <button onClick={() => setIsOutlookModalOpen(true)} style={{ padding: '8px 12px', backgroundColor: '#f57c00', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            Company Outlook
          </button>

          <button onClick={handleExportCSV} style={{ padding: '8px 12px', backgroundColor: '#1565c0', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Export Journal
          </button>

          <button onClick={() => setIsUploadModalOpen(true)} style={{ padding: '8px 12px', backgroundColor: '#5c6bc0', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            Upload Transaction
          </button>
          
          <div style={{ borderLeft: '2px solid #ddd', height: '24px' }}></div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div title="Your Total Portfolio Value (Cash + Invested). Automatically saves to your browser." style={{ display: 'flex', alignItems: 'center', backgroundColor: '#e3f2fd', padding: '4px 8px', borderRadius: '4px', border: '1px solid #90caf9' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#1565c0', marginRight: '6px', textTransform: 'uppercase' }}>Equity $:</label>
              <input type="number" value={accountEquity} onChange={(e) => setAccountEquity(e.target.value)} style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ccc', width: '100px', outline: 'none' }} placeholder="100000" />
            </div>

            <div style={{ borderLeft: '2px solid #ddd', height: '24px', margin: '0 5px' }}></div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', marginRight: '6px', textTransform: 'uppercase' }}>Start:</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', marginRight: '6px', textTransform: 'uppercase' }}>End:</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }} />
            </div>
            <button onClick={() => { setStartDate(''); setEndDate(''); }} style={{ padding: '6px 10px', fontSize: '12px', cursor: 'pointer', backgroundColor: '#e0e0e0', border: 'none', borderRadius: '4px' }}>Clear</button>
          </div>
          <div style={{ borderLeft: '2px solid #ddd', height: '24px' }}></div>
          <button onClick={() => setIsAuthenticated(false)} style={{ padding: '6px 12px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Lock</button>
        </div>
      </div>

      {/* OUTLOOK MODAL */}
      {isOutlookModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '25px', borderRadius: '8px', width: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#333' }}>Company Operations & Outlook</h3>
              <button onClick={() => setIsOutlookModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>&times;</button>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <input type="text" value={outlookTicker} onChange={(e) => setOutlookTicker(e.target.value.toUpperCase())} placeholder="Enter Stock Ticker (e.g. AAPL)" style={{ flex: 1, padding: '10px', border: '1px solid #ccc', borderRadius: '4px', outline: 'none', fontSize: '14px', textTransform: 'uppercase' }} />
              <button onClick={handleFetchOutlook} disabled={outlookIsFetching} style={{ padding: '10px 20px', backgroundColor: '#f57c00', color: 'white', border: 'none', borderRadius: '4px', cursor: outlookIsFetching ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {outlookIsFetching ? 'Scanning...' : 'Analyze'}
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '5px' }}>
              {outlookResults?.error && (
                <p style={{ color: '#d32f2f', fontWeight: 'bold', padding: '10px', backgroundColor: '#ffebee', borderRadius: '4px' }}>Failed to pull news data. Please check your internet connection and try again.</p>
              )}

              {outlookResults?.analysis && (
                <div style={{ backgroundColor: '#e3f2fd', padding: '15px', borderRadius: '6px', border: '1px solid #90caf9', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#1565c0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    Synthesized Outlook Analysis
                  </h4>
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', color: '#333' }}>{outlookResults.analysis}</p>
                </div>
              )}

              {outlookResults?.news && (
                <div>
                  <h4 style={{ margin: '0 0 10px 0', color: '#555' }}>Filtered Operational Headlines</h4>
                  <p style={{ fontSize: '12px', color: '#888', marginTop: '-5px', marginBottom: '15px' }}>Strictly filtering out stock prices, analyst ratings, and wall street jargon.</p>
                  
                  {outlookResults.news.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#666' }}>No strictly operational news found recently.</p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {outlookResults.news.map((item, idx) => (
                        <li key={idx} style={{ fontSize: '13px', color: '#444', lineHeight: '1.4' }}>
                          <a href={item.link} target="_blank" rel="noreferrer" style={{ color: '#1565c0', textDecoration: 'none', fontWeight: '500' }}>
                            {item.title.split(' - ').slice(0, -1).join(' - ') || item.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            
          </div>
        </div>
      )}

      {/* UPLOAD MODAL */}
      {isUploadModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '25px', borderRadius: '8px', width: '380px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#333' }}>Upload Transactions</h3>
              <button onClick={() => setIsUploadModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>&times;</button>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#555', marginBottom: '8px' }}>Select Broker Format:</label>
              <select value={uploadFormat} onChange={(e) => setUploadFormat(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', outline: 'none', fontSize: '14px', cursor: 'pointer' }}>
                <option value="Standard">Standard Format (Generic CSV)</option>
                <option value="IB">Interactive Brokers</option>
                <option value="Questrade">Questrade</option>
              </select>
            </div>
            
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#555', marginBottom: '8px' }}>Choose CSV File:</label>
              <input type="file" accept=".csv" onChange={handleFileUpload} style={{ width: '100%', padding: '10px', border: '1px dashed #ccc', borderRadius: '4px', cursor: 'pointer' }} />
            </div>
          </div>
        </div>
      )}

      {/* CALCULATOR MODAL */}
      {isCalcModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '25px', borderRadius: '8px', width: '420px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#333' }}>Position Size Calculator</h3>
              <button onClick={() => setIsCalcModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>&times;</button>
            </div>
            <div style={{ display: 'flex', backgroundColor: '#f0f0f0', borderRadius: '6px', padding: '4px', marginBottom: '20px' }}>
              <button onClick={() => setCalcMode('position')} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: calcMode === 'position' ? '#fff' : 'transparent', color: calcMode === 'position' ? '#1565c0' : '#666', boxShadow: calcMode === 'position' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>By Position %</button>
              <button onClick={() => setCalcMode('risk')} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: calcMode === 'risk' ? '#fff' : 'transparent', color: calcMode === 'risk' ? '#1565c0' : '#666', boxShadow: calcMode === 'risk' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>By Risk %</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#555' }}>Ticker:</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {isFetchingPrice && <span style={{ fontSize: '11px', color: '#1565c0' }}>Fetching...</span>}
                  <input type="text" value={calcTicker} onChange={(e) => setCalcTicker(e.target.value.toUpperCase())} onBlur={handleCalcTickerBlur} placeholder="e.g. AAPL" style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '120px', outline: 'none', textTransform: 'uppercase' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#555' }}>Total Account Capital ($):</label>
                <input type="number" value={calcTotalCapital} onChange={(e) => setCalcTotalCapital(e.target.value)} placeholder="e.g. 10000" style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '120px', outline: 'none' }} />
              </div>
              {calcMode === 'position' ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#555' }}>Position Allocation (%):</label>
                  <input type="number" value={calcPositionPct} onChange={(e) => setCalcPositionPct(e.target.value)} placeholder="e.g. 10" style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '120px', outline: 'none' }} />
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#d32f2f' }}>Max Risk to Portfolio (%):</label>
                  <input type="number" value={calcRiskPct} onChange={(e) => setCalcRiskPct(e.target.value)} placeholder="e.g. 1.5" style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '120px', outline: 'none' }} />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#555', marginTop: '10px' }}>Stock Entry Price ($):</label>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <input type="number" value={calcEntryPrice} onChange={(e) => setCalcEntryPrice(e.target.value)} placeholder="0.00" style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '120px', outline: 'none' }} />
                  {calcHighOfDay && calcLowOfDay && (
                    <span style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>HOD: <b>${calcHighOfDay}</b> | LOD: <b>${calcLowOfDay}</b></span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#555' }}>Stop Loss Price ($):</label>
                <input type="number" value={calcStopLoss} onChange={(e) => setCalcStopLoss(e.target.value)} placeholder="0.00" style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '120px', outline: 'none' }} />
              </div>
            </div>
            <div style={{ marginTop: '25px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #ddd' }}>
              <h4 style={{ margin: '0 0 15px 0', color: '#333', textAlign: 'center' }}>Trade Execution Plan</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', color: '#555' }}>Shares to Buy:</span>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#1565c0' }}>{calcShares}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', color: '#555' }}>Capital Allocated:</span>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>${calcCapitalAllocated.toFixed(2)} <span style={{fontSize:'12px', color:'#888', fontWeight:'normal'}}>({calcPositionAllocPct.toFixed(1)}%)</span></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', color: '#555' }}>Total Open Risk ($):</span>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: calcOpenRiskDollar > 0 ? '#d32f2f' : '#888' }}>{calcOpenRiskDollar > 0 ? `$${calcOpenRiskDollar.toFixed(2)}` : '--'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: '#555' }}>Risk to Portfolio (%):</span>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: calcOpenRiskPct > 0 ? '#d32f2f' : '#888' }}>{calcOpenRiskPct > 0 ? `${calcOpenRiskPct.toFixed(2)}%` : '--'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Sidebar */}
        <div style={{ width: '360px', borderRight: '1px solid #ddd', overflowY: 'auto', padding: '15px', backgroundColor: '#fafafa' }}>
          {Object.keys(tickerStats).length > 0 && (
            <div style={{ marginBottom: '25px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ddd', paddingBottom: '8px', marginBottom: '10px' }}>
                <h3 style={{ margin: 0 }}>Portfolio Summary</h3>
                {uniqueTickers.length > 0 && (
                  <select value={portfolioFilter} onChange={(e) => { setPortfolioFilter(e.target.value); setHistoryFilter(e.target.value); }} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px', outline: 'none' }}>
                    <option value="All">All Tickers</option>
                    {uniqueTickers.map(ticker => (<option key={ticker} value={ticker}>{ticker}</option>))}
                  </select>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                <input type="checkbox" id="showClosed" checked={showClosedPositions} onChange={(e) => setShowClosedPositions(e.target.checked)} style={{ cursor: 'pointer' }} />
                <label htmlFor="showClosed" style={{ fontSize: '13px', marginLeft: '6px', color: '#555', cursor: 'pointer', userSelect: 'none' }}>Show closed positions (Qty: 0)</label>
              </div>

              {Object.values(tickerStats)
                .filter(stat => showClosedPositions || stat.qty > 0)
                .filter(stat => portfolioFilter === 'All' || stat.ticker === portfolioFilter)
                .sort((a, b) => a.ticker.localeCompare(b.ticker) || a.positionNum - b.positionNum)
                .map(stat => {
                const totalTickerPositions = Object.values(tickerStats).filter(s => s.ticker === stat.ticker).length;
                const displayName = totalTickerPositions > 1 ? `${stat.ticker} (Trade #${stat.positionNum})` : stat.ticker;
                const posWinRate = stat.tradesClosed > 0 ? ((stat.winningTrades / stat.tradesClosed) * 100).toFixed(0) : 0;
                const posPF = stat.grossLoss === 0 ? (stat.grossProfit > 0 ? 'MAX' : '0.0') : (stat.grossProfit / stat.grossLoss).toFixed(1);
                const posAvgDays = stat.sharesClosed > 0 ? (stat.totalDaysHeld / stat.sharesClosed).toFixed(1) : 0;
                const stopPrice = parseFloat(riskPrices[stat.id]);
                const openRisk = !isNaN(stopPrice) ? (stat.avgCost - stopPrice) * stat.qty : null;
                const riskPct = !isNaN(stopPrice) && stat.avgCost > 0 ? (((stat.avgCost - stopPrice) / stat.avgCost) * 100).toFixed(2) : null;

                const breakEvenPrice = stat.qty > 0 ? stat.avgCost - (stat.realizedPL / stat.qty) : null;
                const breakEvenPct = breakEvenPrice !== null && stat.currentPrice > 0 ? ((breakEvenPrice / stat.currentPrice) - 1) * 100 : null;
                const breakEvenPctStr = breakEvenPct !== null ? ` (${breakEvenPct > 0 ? '+' : ''}${breakEvenPct.toFixed(2)}%)` : '';
                const currentR = (stat.qty > 0 && stat.avgCost > 0 && stat.currentPrice > 0) ? ((stat.currentPrice / stat.avgCost - 1) / 0.02).toFixed(2) : null;

                return (
                  <div key={stat.id} onClick={() => { setSelectedTicker(stat.ticker); setActiveTab('chart'); setPortfolioFilter(stat.ticker); setHistoryFilter(stat.ticker); }} style={{ padding: '12px', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}>
                      <span>{displayName} <span style={{fontSize: '13px', color: '#666', fontWeight: 'normal'}}>(Qty: {stat.qty})</span></span>
                      <span>${stat.currentPrice && stat.qty > 0 ? stat.currentPrice.toFixed(2) : '--'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                      <span style={{ color: '#555' }}>Realized P/L:</span>
                      <span style={{ color: stat.realizedPL >= 0 ? '#2e7d32' : '#d32f2f', fontWeight: '600' }}>{stat.realizedPL >= 0 ? '+' : ''}${stat.realizedPL.toFixed(2)}</span>
                    </div>
                    {stat.qty > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                        <span style={{ color: '#555' }}>Open P/L:</span>
                        <span style={{ color: stat.openPL >= 0 ? '#2e7d32' : '#d32f2f', fontWeight: '600' }}>{stat.openPL >= 0 ? '+' : ''}${stat.openPL.toFixed(2)}</span>
                      </div>
                    )}
                    {stat.qty > 0 && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #eee' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                          <span style={{ color: '#555' }}>Break-Even Price:</span>
                          <span style={{ color: '#1565c0', fontWeight: 'bold' }}>${breakEvenPrice.toFixed(2)}{breakEvenPctStr}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                          <span style={{ color: '#555' }}>Current R:</span>
                          <span style={{ color: currentR > 0 ? '#2e7d32' : (currentR < 0 ? '#d32f2f' : '#333'), fontWeight: 'bold' }}>{currentR !== null ? `${currentR}R` : '--'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginBottom: '4px' }}>
                          <span style={{ color: '#555' }}>Stop Price:</span>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', color: '#888', fontSize: '12px' }}>$</span>
                            <input type="number" step="0.01" value={riskPrices[stat.id] || ''} onChange={(e) => setRiskPrices({...riskPrices, [stat.id]: e.target.value})} onBlur={(e) => syncStopPrice(stat.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { syncStopPrice(stat.id, e.target.value); e.target.blur(); } }} onClick={(e) => e.stopPropagation()} style={{ width: '80px', padding: '2px 4px 2px 16px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', outline: 'none' }} placeholder="0.00" />
                          </div>
                        </div>
                        {openRisk !== null && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '4px' }}>
                            <span style={{ color: '#555' }}>Risk (Locked Profit):</span>
                            <span style={{ color: openRisk > 0 ? '#d32f2f' : '#2e7d32', fontWeight: 'bold' }}>${openRisk.toFixed(2)} ({riskPct}%)</span>
                          </div>
                        )}
                      </div>
                    )}
                    {stat.tradesClosed > 0 && (
                      <div style={{ backgroundColor: '#f5f5f5', padding: '6px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#555', fontWeight: 'bold', marginTop: '8px' }}>
                        <span>WIN: {posWinRate}%</span><span>PF: {posPF}</span><span>HELD: {posAvgDays}d</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '2px solid #ddd', paddingBottom: '8px' }}>
            <h3 style={{ margin: '0' }}>Trade History</h3>
            {uniqueTickers.length > 0 && (
              <select value={historyFilter} onChange={(e) => { setHistoryFilter(e.target.value); setPortfolioFilter(e.target.value); }} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px', outline: 'none' }}>
                <option value="All">All Tickers</option>
                {uniqueTickers.map(ticker => (<option key={ticker} value={ticker}>{ticker}</option>))}
              </select>
            )}
          </div>
          
          {trades.length === 0 ? <p style={{ color: '#888' }}>No trades found for this period.</p> : null}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {analyzedTrades
              .filter(trade => historyFilter === 'All' || trade.ticker === historyFilter)
              .map((trade, index) => {
                const isSelected = selectedTicker === trade.ticker;
                const colorIdx = (trade.positionNum - 1) % CYCLE_COLORS.length;
                const bgColor = isSelected ? CYCLE_COLORS[colorIdx].bg : '#fff';
                const borderColor = isSelected ? CYCLE_COLORS[colorIdx].border : '#e0e0e0';
                return (
                  <li key={index} onClick={() => { setSelectedTicker(trade.ticker); setActiveTab('chart'); setPortfolioFilter(trade.ticker); setHistoryFilter(trade.ticker); }} style={{ padding: '12px', marginBottom: '8px', cursor: 'pointer', borderRadius: '6px', transition: 'background-color 0.2s', backgroundColor: bgColor, border: `1px solid ${borderColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                      <span>{trade.ticker} <span style={{fontSize: '11px', color: '#888', fontWeight: 'normal'}}>#{trade.positionNum}</span></span>
                      <span style={{ color: trade['buy/sell'] === 'buy' ? '#26a69a' : '#ef5350' }}>{trade['buy/sell'].toUpperCase()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666', marginTop: '6px' }}>
                      <span>{trade.formattedDate}</span><span>{trade.quantity} @ ${trade.price.toFixed(2)}</span>
                    </div>
                  </li>
                );
            })}
          </ul>
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', overflowY: 'auto' }}>
          
          {/* Top Analytics Dashboard */}
          {statsArray.length > 0 && (
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
              
              <div title="Gross Profit divided by Gross Loss across all closed trades." style={{ flex: 1, minWidth: '120px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0', cursor: 'help' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>Profit Factor</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: profitFactor > 1 || profitFactor === 'MAX' ? '#2e7d32' : '#d32f2f' }}>{profitFactor}</div>
              </div>
              <div title="Percentage of closed trades that resulted in a profit." style={{ flex: 1, minWidth: '120px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0', cursor: 'help' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>Win Rate</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: winRate >= 50 ? '#2e7d32' : '#d32f2f' }}>{winRate}%</div>
              </div>
              <div title="Total realized profit minus total realized loss." style={{ flex: 1, minWidth: '140px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0', cursor: 'help' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>Net Realized P/L</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: totalRealizedPL >= 0 ? '#2e7d32' : '#d32f2f' }}>{totalRealizedPL >= 0 ? '+' : '-'}${Math.abs(totalRealizedPL).toFixed(2)}</div>
              </div>
              <div title="Total capital currently deployed in open positions as a percentage of your Account Equity." style={{ flex: 1, minWidth: '140px', padding: '12px', backgroundColor: '#e8f5e9', borderRadius: '8px', border: '1px solid #c8e6c9', cursor: 'help' }}>
                <div style={{ fontSize: '11px', color: '#2e7d32', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Invested</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2e7d32' }}>
                  ${totalInvested.toFixed(0)} <span style={{fontSize: '12px', fontWeight: 'normal'}}>({totalPosPct}%)</span>
                </div>
              </div>
              <div title="Amount of open equity at risk: (Current Price - Stop Price) × Open Shares." style={{ flex: 1, minWidth: '140px', padding: '12px', backgroundColor: '#e3f2fd', borderRadius: '8px', border: '1px solid #bbdefb', cursor: 'help' }}>
                <div style={{ fontSize: '11px', color: '#1565c0', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Open Heat</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1565c0' }}>${totalOpenHeat.toFixed(2)}</div>
              </div>
              <div title="Amount of initial capital at risk: (Avg Cost - Stop Price) × Open Shares. % is based on Account Equity." style={{ flex: 1, minWidth: '140px', padding: '12px', backgroundColor: '#fff3e0', borderRadius: '8px', border: '1px solid #ffe0b2', cursor: 'help' }}>
                <div style={{ fontSize: '11px', color: '#e65100', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Open Risk</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: totalOpenRisk > 0 ? '#d32f2f' : '#2e7d32' }}>
                  {totalOpenRisk >= 0 ? '' : '-'}${Math.abs(totalOpenRisk).toFixed(2)} <span style={{fontSize: '12px', fontWeight: 'normal'}}>({globalRiskPct}%)</span>
                </div>
              </div>

              {/* Row 2: Advanced Stats */}
              <div style={{ flexBasis: '100%', height: '0' }}></div> 
              
              <div title="The largest peak-to-trough drop in your cumulative realized P/L." style={{ flex: 1, minWidth: '140px', padding: '12px', backgroundColor: '#ffebee', borderRadius: '8px', border: '1px solid #ffcdd2', cursor: 'help' }}>
                <div style={{ fontSize: '11px', color: '#c62828', textTransform: 'uppercase', fontWeight: 'bold' }}>Max Drawdown</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#c62828' }}>-${Math.abs(advancedStats.maxDD).toFixed(2)}</div>
              </div>
              <div title="Average number of days positions were held before closing." style={{ flex: 1, minWidth: '120px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0', cursor: 'help' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>Avg Hold (Overall)</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>{globalAvgDaysHeld} Days</div>
              </div>
              <div title="Average days held for trades that closed in profit." style={{ flex: 1, minWidth: '140px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0', cursor: 'help' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>Avg Hold (Wins)</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2e7d32' }}>{advancedStats.avgWinDays} Days</div>
              </div>
              <div title="Average days held for trades that closed at a loss." style={{ flex: 1, minWidth: '140px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0', cursor: 'help' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>Avg Hold (Losses)</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#d32f2f' }}>{advancedStats.avgLossDays} Days</div>
              </div>
              <div title="Longest consecutive streak of winning trades (W) and losing trades (L)." style={{ flex: 1, minWidth: '140px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0', cursor: 'help' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>Max Streaks</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>
                  <span style={{ color: '#2e7d32' }}>{advancedStats.maxWinStreak}W</span> / <span style={{ color: '#d32f2f' }}>{advancedStats.maxLossStreak}L</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB NAVIGATION */}
          <div style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '20px' }}>
            <button onClick={() => setActiveTab('chart')} style={{ padding: '10px 20px', border: 'none', borderBottom: activeTab === 'chart' ? '3px solid #1565c0' : '3px solid transparent', backgroundColor: 'transparent', cursor: 'pointer', fontWeight: activeTab === 'chart' ? 'bold' : 'normal', color: activeTab === 'chart' ? '#1565c0' : '#555', fontSize: '15px' }}>Chart View</button>
            <button onClick={() => setActiveTab('table')} style={{ padding: '10px 20px', border: 'none', borderBottom: activeTab === 'table' ? '3px solid #1565c0' : '3px solid transparent', backgroundColor: 'transparent', cursor: 'pointer', fontWeight: activeTab === 'table' ? 'bold' : 'normal', color: activeTab === 'table' ? '#1565c0' : '#555', fontSize: '15px' }}>Table View</button>
            <button onClick={() => setActiveTab('monthly')} style={{ padding: '10px 20px', border: 'none', borderBottom: activeTab === 'monthly' ? '3px solid #1565c0' : '3px solid transparent', backgroundColor: 'transparent', cursor: 'pointer', fontWeight: activeTab === 'monthly' ? 'bold' : 'normal', color: activeTab === 'monthly' ? '#1565c0' : '#555', fontSize: '15px' }}>Monthly View</button>
          </div>

          {/* ========================================= */}
          {/* CHART TAB                 */}
          {/* ========================================= */}
          <div style={{ display: activeTab === 'chart' ? 'block' : 'none' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>{selectedTicker ? `${selectedTicker} Daily Chart` : 'Select a trade to view the chart'}</h3>
            </div>

            <div ref={chartContainerRef} style={{ flex: 1, width: '100%', minHeight: '600px', border: '1px solid #ddd', borderRadius: '4px' }} />

            {/* OPEN Position Analytics with NOTES */}
            {selectedTicker && Object.values(tickerStats)
              .filter(stat => stat.ticker === selectedTicker && stat.qty > 0)
              .map((stat) => {
                const totalTickerPositions = Object.values(tickerStats).filter(s => s.ticker === stat.ticker).length;
                const displayName = totalTickerPositions > 1 ? `${stat.ticker} (Active Trade #${stat.positionNum})` : stat.ticker;
                const today = new Date(); let totalOpenDays = 0;
                stat.openLots.forEach(lot => { const days = (today - lot.date) / (1000 * 60 * 60 * 24); totalOpenDays += Math.max(0, days) * lot.qty; });
                const currentDaysHeld = stat.qty > 0 ? (totalOpenDays / stat.qty).toFixed(1) : 0;
                const stopPrice = parseFloat(riskPrices[stat.id]);
                const openRisk = !isNaN(stopPrice) ? (stat.avgCost - stopPrice) * stat.qty : null;
                const riskPct = !isNaN(stopPrice) && stat.avgCost > 0 ? (((stat.avgCost - stopPrice) / stat.avgCost) * 100).toFixed(2) : null;
                const openHeat = !isNaN(stopPrice) && stat.currentPrice > 0 ? (stat.currentPrice - stopPrice) * stat.qty : null;
                
                const breakEvenPrice = stat.qty > 0 ? stat.avgCost - (stat.realizedPL / stat.qty) : null;
                const breakEvenPct = breakEvenPrice !== null && stat.currentPrice > 0 ? ((breakEvenPrice / stat.currentPrice) - 1) * 100 : null;
                const breakEvenPctStr = breakEvenPct !== null ? ` (${breakEvenPct > 0 ? '+' : ''}${breakEvenPct.toFixed(2)}%)` : '';
                
                const indPosSizePct = parsedEquity > 0 ? (((stat.qty * stat.avgCost) / parsedEquity) * 100).toFixed(2) + '%' : '--';
                const currentR = (stat.avgCost > 0 && stat.currentPrice > 0) ? ((stat.currentPrice / stat.avgCost - 1) / 0.02).toFixed(2) : null;

                return (
                  <div key={stat.id} style={{ marginTop: '20px', padding: '12px', backgroundColor: '#e3f2fd', borderRadius: '8px', border: '1px solid #90caf9' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#1565c0' }}>{displayName} Live Position Analytics</h4>
                    <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '120px', padding: '8px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #bbdefb' }}>
                        <div style={{ fontSize: '10px', color: '#1565c0', textTransform: 'uppercase', fontWeight: 'bold' }}>Open P/L</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: stat.openPL >= 0 ? '#2e7d32' : '#d32f2f' }}>{stat.openPL >= 0 ? '+' : '-'}${Math.abs(stat.openPL).toFixed(2)}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: '120px', padding: '8px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #bbdefb' }}>
                        <div style={{ fontSize: '10px', color: '#1565c0', textTransform: 'uppercase', fontWeight: 'bold' }}>Pos Sizing (%)</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>{indPosSizePct}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: '120px', padding: '8px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #bbdefb' }}>
                        <div style={{ fontSize: '10px', color: '#1565c0', textTransform: 'uppercase', fontWeight: 'bold' }}>Break-Even</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>{breakEvenPrice !== null ? `$${breakEvenPrice.toFixed(2)}${breakEvenPctStr}` : '--'}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: '120px', padding: '8px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #bbdefb' }}>
                        <div style={{ fontSize: '10px', color: '#1565c0', textTransform: 'uppercase', fontWeight: 'bold' }}>Current R</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: currentR !== null ? (currentR > 0 ? '#2e7d32' : '#d32f2f') : '#888' }}>{currentR !== null ? `${currentR}R` : '--'}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: '120px', padding: '8px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #bbdefb' }}>
                        <div style={{ fontSize: '10px', color: '#1565c0', textTransform: 'uppercase', fontWeight: 'bold' }}>Open Risk</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: openRisk === null ? '#888' : (openRisk > 0 ? '#d32f2f' : '#2e7d32') }}>{openRisk !== null ? `$${openRisk.toFixed(2)} (${riskPct}%)` : 'Set Stop'}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: '120px', padding: '8px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #bbdefb' }}>
                        <div style={{ fontSize: '10px', color: '#1565c0', textTransform: 'uppercase', fontWeight: 'bold' }}>Open Heat</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>{openHeat !== null ? `$${openHeat.toFixed(2)}` : 'Set Stop'}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '10px', color: '#1565c0', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '4px' }}>Trade Notes</div>
                      <textarea value={tradeNotes[stat.id] || ''} onChange={(e) => setTradeNotes({...tradeNotes, [stat.id]: e.target.value})} onBlur={(e) => syncTradeNote(stat.id, e.target.value)} placeholder="Add notes, thesis, or reflections for this trade cycle..." style={{ width: '100%', minHeight: '40px', padding: '8px', borderRadius: '6px', border: '1px solid #bbdefb', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '13px', resize: 'vertical' }} />
                    </div>
                  </div>
                );
              })
            }

            {/* CLOSED Position Analytics with NOTES */}
            {selectedTicker && Object.values(tickerStats)
              .filter(stat => stat.ticker === selectedTicker && stat.qty === 0)
              .map((stat) => {
                const totalTickerPositions = Object.values(tickerStats).filter(s => s.ticker === stat.ticker).length;
                const displayName = totalTickerPositions > 1 ? `${stat.ticker} (Trade #${stat.positionNum})` : stat.ticker;
                
                return (
                  <div key={stat.id} style={{ marginTop: '20px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#333' }}>{displayName} Closed Position Analytics</h4>
                    <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '120px', padding: '8px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #ddd' }}>
                        <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>Days to Hold</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>{stat.sharesClosed > 0 ? (stat.totalDaysHeld / stat.sharesClosed).toFixed(1) : 0} Days</div>
                      </div>
                      <div style={{ flex: 1, minWidth: '120px', padding: '8px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #ddd' }}>
                        <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>P/L $</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: stat.realizedPL >= 0 ? '#2e7d32' : '#d32f2f' }}>{stat.realizedPL >= 0 ? '+' : '-'}${Math.abs(stat.realizedPL).toFixed(2)}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: '120px', padding: '8px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #ddd' }}>
                        <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>P/L %</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: stat.realizedPL >= 0 ? '#2e7d32' : '#d32f2f' }}>{stat.totalClosedCost > 0 ? (stat.realizedPL >= 0 ? '+' : '') + ((stat.realizedPL / stat.totalClosedCost) * 100).toFixed(2) + '%' : '0.00%'}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '4px' }}>Trade Notes</div>
                      <textarea value={tradeNotes[stat.id] || ''} onChange={(e) => setTradeNotes({...tradeNotes, [stat.id]: e.target.value})} onBlur={(e) => syncTradeNote(stat.id, e.target.value)} placeholder="Add notes, thesis, or reflections for this trade cycle..." style={{ width: '100%', minHeight: '40px', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '13px', resize: 'vertical' }} />
                    </div>
                  </div>
                );
              })
            }
          </div>

          {/* ========================================= */}
          {/* TABLE TAB                 */}
          {/* ========================================= */}
          <div style={{ display: activeTab === 'table' ? 'block' : 'none', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '950px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd', borderTop: '1px solid #ddd' }}>
                  <th style={{ padding: '12px 10px', textAlign: 'left', color: '#555' }}>Position</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', color: '#555' }}>Status</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Qty</th>
                  <th title="Percentage of Account Equity allocated to this position." style={{ padding: '12px 10px', textAlign: 'right', color: '#555', cursor: 'help' }}>Pos %</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Realized P/L</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Open P/L</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Break-Even</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Current R</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', color: '#555' }}>Win % / PF</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Days Held</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Stop Price</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Open Risk</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Open Heat</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(tickerStats)
                  .filter(stat => showClosedPositions || stat.qty > 0)
                  .filter(stat => portfolioFilter === 'All' || stat.ticker === portfolioFilter)
                  .sort((a, b) => a.ticker.localeCompare(b.ticker) || a.positionNum - b.positionNum)
                  .map((stat, index) => {
                    const totalTickerPositions = Object.values(tickerStats).filter(s => s.ticker === stat.ticker).length;
                    const displayName = totalTickerPositions > 1 ? `${stat.ticker} (#${stat.positionNum})` : stat.ticker;
                    const isClosed = stat.qty === 0;
                    const posWinRate = stat.tradesClosed > 0 ? ((stat.winningTrades / stat.tradesClosed) * 100).toFixed(0) + '%' : '--';
                    const posPF = stat.grossLoss === 0 ? (stat.grossProfit > 0 ? 'MAX' : '--') : (stat.grossProfit / stat.grossLoss).toFixed(1);
                    
                    let displayDaysHeld = '--';
                    if (isClosed && stat.sharesClosed > 0) { displayDaysHeld = (stat.totalDaysHeld / stat.sharesClosed).toFixed(1); } 
                    else if (!isClosed && stat.qty > 0) {
                      const today = new Date(); let totalOpenDays = 0;
                      stat.openLots.forEach(lot => { const days = (today - lot.date) / (1000 * 60 * 60 * 24); totalOpenDays += Math.max(0, days) * lot.qty; });
                      displayDaysHeld = (totalOpenDays / stat.qty).toFixed(1);
                    }

                    const stopPrice = parseFloat(riskPrices[stat.id]);
                    const openRisk = !isClosed && !isNaN(stopPrice) ? (stat.avgCost - stopPrice) * stat.qty : null;
                    const openHeat = !isClosed && !isNaN(stopPrice) && stat.currentPrice > 0 ? (stat.currentPrice - stopPrice) * stat.qty : null;
                    const tablePosSizePct = !isClosed && parsedEquity > 0 ? (((stat.qty * stat.avgCost) / parsedEquity) * 100).toFixed(2) + '%' : '--';
                    
                    const breakEvenPrice = !isClosed ? (stat.avgCost - (stat.realizedPL / stat.qty)) : null;
                    const breakEvenPct = !isClosed && stat.currentPrice > 0 ? ((breakEvenPrice / stat.currentPrice) - 1) * 100 : null;
                    const breakEvenPctStr = breakEvenPct !== null ? ` (${breakEvenPct > 0 ? '+' : ''}${breakEvenPct.toFixed(2)}%)` : '';

                    const currentR = (!isClosed && stat.avgCost > 0 && stat.currentPrice > 0) ? ((stat.currentPrice / stat.avgCost - 1) / 0.02) : null;

                    return (
                      <tr key={stat.id} style={{ borderBottom: '1px solid #eee', backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa', transition: 'background-color 0.2s', cursor: 'pointer' }} onClick={() => { setSelectedTicker(stat.ticker); setActiveTab('chart'); setPortfolioFilter(stat.ticker); setHistoryFilter(stat.ticker); }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f8ff'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : '#fafafa'}>
                        <td style={{ padding: '12px 10px', fontWeight: 'bold' }}>{displayName}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}><span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', backgroundColor: isClosed ? '#e0e0e0' : '#bbdefb', color: isClosed ? '#666' : '#1565c0' }}>{isClosed ? 'CLOSED' : 'OPEN'}</span></td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold' }}>{stat.qty}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: '#333' }}>{tablePosSizePct}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: stat.realizedPL >= 0 ? '#2e7d32' : '#d32f2f', fontWeight: 'bold' }}>{stat.realizedPL >= 0 ? '+' : ''}{stat.realizedPL === 0 ? '--' : '$' + stat.realizedPL.toFixed(2)}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: stat.openPL >= 0 ? '#2e7d32' : '#d32f2f', fontWeight: 'bold' }}>{isClosed ? '--' : (stat.openPL >= 0 ? '+' : '') + '$' + stat.openPL.toFixed(2)}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: '#333', fontWeight: 'bold' }}>{isClosed ? '--' : '$' + breakEvenPrice.toFixed(2) + breakEvenPctStr}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: currentR > 0 ? '#2e7d32' : (currentR < 0 ? '#d32f2f' : '#333'), fontWeight: 'bold' }}>{isClosed ? '--' : (currentR !== null ? currentR.toFixed(2) + 'R' : '--')}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#555' }}>{posWinRate} / {posPF}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: '#333' }}>{displayDaysHeld}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          {isClosed ? '--' : (
                            <input type="number" step="0.01" value={riskPrices[stat.id] || ''} onChange={(e) => setRiskPrices({...riskPrices, [stat.id]: e.target.value})} onBlur={(e) => syncStopPrice(stat.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { syncStopPrice(stat.id, e.target.value); e.target.blur(); } }} onClick={(e) => e.stopPropagation()} style={{ width: '70px', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', outline: 'none', textAlign: 'right' }} placeholder="0.00" />
                          )}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: openRisk === null ? '#aaa' : (openRisk > 0 ? '#d32f2f' : '#2e7d32'), fontWeight: 'bold' }}>{isClosed ? '--' : (openRisk !== null ? `$${openRisk.toFixed(2)}` : 'Set Stop')}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: '#333', fontWeight: 'bold' }}>{isClosed ? '--' : (openHeat !== null ? `$${openHeat.toFixed(2)}` : 'Set Stop')}</td>
                      </tr>
                    );
                })}
              </tbody>
            </table>
          </div>

          {/* ========================================= */}
          {/* MONTHLY VIEW TAB                 */}
          {/* ========================================= */}
          <div style={{ display: activeTab === 'monthly' ? 'block' : 'none', overflowX: 'auto' }}>
            {Object.keys(monthlyStats).length === 0 ? (
              <p style={{ color: '#888', padding: '20px' }}>No closed trades available to calculate monthly analytics.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '800px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd', borderTop: '1px solid #ddd' }}>
                    <th style={{ padding: '12px 10px', textAlign: 'left', color: '#555' }}>Month</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Trades Closed</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Win Rate</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Profit Factor</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Gross Profit</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Gross Loss</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right', color: '#555' }}>Net Realized P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(monthlyStats)
                    .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
                    .map((stat, index) => {
                      const monthWinRate = stat.tradesClosed > 0 ? ((stat.winningTrades / stat.tradesClosed) * 100).toFixed(1) + '%' : '0.0%';
                      const monthPF = stat.grossLoss === 0 ? (stat.grossProfit > 0 ? 'MAX' : '0.00') : (stat.grossProfit / stat.grossLoss).toFixed(2);
                      return (
                        <tr key={stat.monthKey} style={{ borderBottom: '1px solid #eee', backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa', transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f8ff'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : '#fafafa'}>
                          <td style={{ padding: '12px 10px', fontWeight: 'bold', fontSize: '15px' }}>{stat.monthKey}</td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold' }}>{stat.tradesClosed}</td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', color: parseFloat(monthWinRate) >= 50 ? '#2e7d32' : '#d32f2f', fontWeight: 'bold' }}>{monthWinRate}</td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', color: monthPF > 1 || monthPF === 'MAX' ? '#2e7d32' : '#d32f2f', fontWeight: 'bold' }}>{monthPF}</td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', color: '#2e7d32' }}>+${stat.grossProfit.toFixed(2)}</td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', color: '#d32f2f' }}>-${stat.grossLoss.toFixed(2)}</td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', color: stat.realizedPL >= 0 ? '#2e7d32' : '#d32f2f', fontWeight: 'bold', fontSize: '15px' }}>{stat.realizedPL >= 0 ? '+' : '-'}${Math.abs(stat.realizedPL).toFixed(2)}</td>
                        </tr>
                      );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}