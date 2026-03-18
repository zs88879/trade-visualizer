# 📈 Trade Visualizer & Analytics Dashboard

**Live Demo:** [Insert Your Vercel Link Here]

A full-stack React web application designed to ingest raw trading history, automatically construct discrete trade cycles, and generate professional-grade performance analytics. Built to provide an institutional-level view of personal trading strategies by calculating metrics like Profit Factor, Open Risk/Heat, and historical batting averages.

## 🚀 Key Features

* **Automated Trade Cycle Detection:** Parses raw CSV trade exports and intelligently groups individual "Buys" and "Sells" into numbered, chronological trade cycles (e.g., AAPL #1, AAPL #2) using FIFO (First-In-First-Out) logic.
* **Advanced Performance Metrics:** Calculates crucial trading statistics on the fly, including Win Rate, Profit Factor, Gross Profit/Loss, and Average Days Held.
* **Interactive Charting:** Integrates TradingView's Lightweight Charts to render high-performance candlestick charts. Overlays specific Buy/Sell execution markers directly onto the price action, color-coded by trade cycle.
* **Risk Management Tracking:** Connects to a Supabase backend to persistently track "Stop Prices" for open positions, automatically calculating total Open Risk (locked capital) vs. Open Heat (unrealized profit).
* **Multi-Dimensional Views:** * **Chart View:** Focuses on technical execution and live position analytics.
    * **Table View:** A dense, scannable data grid for holistic portfolio management.
    * **Monthly View:** Aggregates performance over time to analyze macro strategy consistency.

## 🛠️ Tech Stack & Architecture

* **Frontend:** React.js, Vite
* **Backend & Database:** Supabase (PostgreSQL), Row Level Security (RLS)
* **Data Visualization:** TradingView Lightweight Charts
* **Data Parsing:** PapaParse (for robust client-side CSV processing)
* **Market Data:** Yahoo Finance API (proxied for real-time open position pricing)

## 🧠 Technical Highlights for Reviewers

* **Complex State Management:** Managed highly interdependent React state where clicking a single table row simultaneously triggers chart rendering, updates portfolio filters, and recalculates cycle-specific risk metrics without prop-drilling or performance bottlenecks.
* **Data Normalization & Algorithms:** Wrote custom algorithmic logic to handle partial position scaling (e.g., buying 100 shares, then selling 50, then selling 50), accurately tracking the specific hold-time and cost basis for each "lot" of shares.
* **Asynchronous API Handling:** Implemented rate-limiting and sequential fetching protocols to pull live market data for multiple open positions simultaneously without overwhelming the proxy or causing UI stutter.
* **Seamless Database Sync:** Built an optimistic UI pattern for the "Stop Price" inputs, allowing the user to seamlessly update their database risk parameters via `onBlur` and `onKeyDown` events.

## 💻 Local Setup Instructions

To run this project locally:

1. Clone the repository:
   `git clone https://github.com/YOUR-USERNAME/trade-visualizer.git`
2. Navigate into the project directory and install dependencies:
   `cd trade-visualizer && npm install`
3. Create a `.env` file in the root directory and add your Supabase credentials:
   `VITE_SUPABASE_URL=your_supabase_project_url`
   `VITE_SUPABASE_ANON_KEY=your_supabase_anon_key`
4. Start the Vite development server:
   `npm run dev`

## 📝 Database Schema (Supabase)

**Table:** `trades`
* `id` (uuid, primary key)
* `trade_date` (date)
* `ticker` (text)
* `action` (text: 'buy' or 'sell')
* `price` (numeric)
* `quantity` (integer)

**Table:** `active_stops`
* `position_id` (text, primary key) - *Format: TICKER-CYCLE#*
* `stop_price` (numeric)