from flask import Flask, render_template, request, jsonify
import yfinance as yf
import numpy as np
from datetime import datetime, timedelta
import pandas as pd

app = Flask(__name__)

def get_industry_peers(ticker):
    try:
        company = yf.Ticker(ticker)
        sector = company.info.get('sector')
        
        if not sector:
            return None, None, None
        
        # Get all tickers in the same sector
        all_tickers = pd.read_html('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies')[0]
        sector_tickers = all_tickers[all_tickers['GICS Sector'] == sector]['Symbol'].tolist()
        
        # Remove the current ticker from the list
        if ticker in sector_tickers:
            sector_tickers.remove(ticker)
        
        # Get PE and PB ratios for all peers
        pe_ratios = []
        pb_ratios = []
        
        for peer in sector_tickers[:20]:  # Limit to 20 peers to avoid rate limiting
            try:
                peer_data = yf.Ticker(peer)
                pe = peer_data.info.get('trailingPE')
                pb = peer_data.info.get('priceToBook')
                
                if pe and isinstance(pe, (int, float)) and pe > 0:
                    pe_ratios.append(pe)
                if pb and isinstance(pb, (int, float)) and pb > 0:
                    pb_ratios.append(pb)
            except:
                continue
        
        # Calculate averages
        avg_pe = np.mean(pe_ratios) if pe_ratios else None
        avg_pb = np.mean(pb_ratios) if pb_ratios else None
        
        return sector, avg_pe, avg_pb
    except Exception as e:
        print(f"Error getting industry peers: {str(e)}")
        return None, None, None

def get_futu_link(ticker):
    """
    Generate a link to the Futu page for a given ticker symbol.
    For US stocks, the format is typically: https://www.futunn.com/stock/AAPL-US
    """
    # Add -US suffix for US stocks
    return f"https://www.futunn.com/stock/{ticker}-US"

def calculate_dcf(ticker, growth_rate, discount_rate, perpetual_growth_rate, years=5, initial_cash_flow=None):
    try:
        # Fetch company data using yfinance
        company = yf.Ticker(ticker)
        
        # Get industry peers and averages
        sector, industry_avg_pe, industry_avg_pb = get_industry_peers(ticker)
        
        # Get Futu link
        futu_link = get_futu_link(ticker)
        
        # Get key statistics
        pe_ratio = company.info.get('trailingPE', None)
        pb_ratio = company.info.get('priceToBook', None)
        
        # Get historical PE and PB ratios for percentile calculation
        pe_percentile = None
        pb_percentile = None
        pe_historical_percentile = None
        pb_historical_percentile = None
        
        try:
            # Get historical data for the last decade
            end_date = datetime.now()
            start_date = end_date - timedelta(days=365*10)  # 10 years
            
            # Get historical market data
            hist_data = company.history(start=start_date, end=end_date)
            
            if not hist_data.empty:
                # Get quarterly financial data
                quarterly_data = company.quarterly_financials
                quarterly_balance = company.quarterly_balance_sheet
                
                # Calculate historical PE and PB ratios
                historical_pe = []
                historical_pb = []
                
                # Process quarterly data to calculate historical ratios
                if not quarterly_data.empty and not quarterly_balance.empty:
                    # Get earnings data
                    earnings = quarterly_data.loc['Net Income'] if 'Net Income' in quarterly_data.index else None
                    
                    # Get book value data
                    book_value = quarterly_balance.loc['Total Stockholder Equity'] if 'Total Stockholder Equity' in quarterly_balance.index else None
                    
                    # Get shares outstanding data
                    shares = company.info.get('sharesOutstanding', None)
                    
                    if earnings is not None and shares is not None:
                        # Calculate historical PE ratios
                        for date, value in earnings.items():
                            # Find the closest price data point
                            closest_price_date = hist_data.index[hist_data.index.get_indexer([date], method='nearest')[0]]
                            price = hist_data.loc[closest_price_date, 'Close']
                            
                            # Calculate PE ratio (annualized earnings)
                            annualized_earnings = value * 4  # Assuming quarterly data
                            if annualized_earnings > 0:
                                pe = (price * shares) / (annualized_earnings * 1e6)  # Convert to millions
                                historical_pe.append(pe)
                    
                    if book_value is not None and shares is not None:
                        # Calculate historical PB ratios
                        for date, value in book_value.items():
                            # Find the closest price data point
                            closest_price_date = hist_data.index[hist_data.index.get_indexer([date], method='nearest')[0]]
                            price = hist_data.loc[closest_price_date, 'Close']
                            
                            # Calculate PB ratio
                            book_value_per_share = (value * 1e6) / shares  # Convert to millions
                            if book_value_per_share > 0:
                                pb = price / book_value_per_share
                                historical_pb.append(pb)
                
                # Calculate percentiles
                if historical_pe and pe_ratio:
                    pe_historical_percentile = sum(1 for x in historical_pe if x < pe_ratio) / len(historical_pe) * 100
                else:
                    pe_historical_percentile = None
                
                if historical_pb and pb_ratio:
                    pb_historical_percentile = sum(1 for x in historical_pb if x < pb_ratio) / len(historical_pb) * 100
                else:
                    pb_historical_percentile = None
        except Exception as e:
            print(f"Error calculating historical percentiles: {str(e)}")
            pe_historical_percentile = None
            pb_historical_percentile = None
        
        # Get the latest free cash flow
        financials = company.cashflow
        if financials.empty:
            return {"error": "No financial data available"}
        
        try:
            fcf = financials.loc['Free Cash Flow'][0]  # Most recent year
            fcf_source = 'Free Cash Flow'
        except:
            # Fallback to Operating Cash Flow if FCF is not available
            fcf = financials.loc['Operating Cash Flow'][0]
            fcf_source = 'Operating Cash Flow'
        
        # Use custom initial cash flow if provided
        if initial_cash_flow is not None and initial_cash_flow != '':
            fcf = float(initial_cash_flow)
            fcf_source = 'User Provided'
        
        # Project future cash flows
        future_cash_flows = []
        for i in range(1, years + 1):
            future_cf = fcf * (1 + growth_rate) ** i
            future_cash_flows.append(future_cf)
        
        # Calculate present value of future cash flows
        present_values = []
        for i, cf in enumerate(future_cash_flows, 1):
            pv = cf / (1 + discount_rate) ** i
            present_values.append(pv)
        
        # Calculate terminal value (Gordon Growth Model)
        terminal_value = future_cash_flows[-1] * (1 + perpetual_growth_rate) / (discount_rate - perpetual_growth_rate)
        terminal_value_pv = terminal_value / (1 + discount_rate) ** years
        
        # Sum all present values
        total_dcf = sum(present_values) + terminal_value_pv
        
        # Get additional company information
        market_cap = company.info.get('marketCap', 0)
        shares_outstanding = company.info.get('sharesOutstanding', 0)
        
        # Calculate per share values
        dcf_per_share = total_dcf / shares_outstanding if shares_outstanding else 0
        current_price = company.info.get('currentPrice', 0)
        
        # Ensure we have valid values for all metrics
        if pe_ratio is not None and isinstance(pe_ratio, (int, float)) and pe_ratio > 0:
            pe_percentile = pe_historical_percentile  # Use historical percentile for current percentile
        else:
            pe_ratio = None
            pe_percentile = None
            pe_historical_percentile = None
            
        if pb_ratio is not None and isinstance(pb_ratio, (int, float)) and pb_ratio > 0:
            pb_percentile = pb_historical_percentile  # Use historical percentile for current percentile
        else:
            pb_ratio = None
            pb_percentile = None
            pb_historical_percentile = None
        
        return {
            "dcf_value": total_dcf,
            "market_cap": market_cap,
            "present_values": present_values,
            "terminal_value": terminal_value_pv,
            "company_name": company.info.get('longName', ticker),
            "dcf_per_share": dcf_per_share,
            "current_price": current_price,
            "initial_cash_flow": fcf,
            "initial_cash_flow_100m": fcf / 100000000,
            "cash_flow_source": fcf_source,
            "future_cash_flows": future_cash_flows,
            "shares_outstanding": shares_outstanding,
            "projected_values": {
                "year": list(range(1, years + 1)),
                "cash_flows": future_cash_flows,
                "present_values": present_values
            },
            "valuation_metrics": {
                "pe_ratio": pe_ratio,
                "pb_ratio": pb_ratio,
                "pe_percentile": pe_percentile,
                "pb_percentile": pb_percentile,
                "pe_historical_percentile": pe_historical_percentile,
                "pb_historical_percentile": pb_historical_percentile,
                "sector": sector,
                "industry_avg_pe": industry_avg_pe,
                "industry_avg_pb": industry_avg_pb,
                "futu_link": futu_link
            }
        }
    
    except Exception as e:
        return {"error": str(e)}

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    data = request.get_json()
    ticker = data.get('ticker', '')
    initial_cash_flow = data.get('initial_cash_flow')
    
    # Convert initial_cash_flow to None if it's an empty string or None
    if initial_cash_flow == '' or initial_cash_flow is None:
        initial_cash_flow = None
    
    growth_rate = float(data.get('growth_rate', 0)) / 100
    discount_rate = float(data.get('discount_rate', 0)) / 100
    perpetual_growth_rate = float(data.get('perpetual_growth_rate', 0)) / 100
    years = int(data.get('years', 5))
    
    result = calculate_dcf(ticker, growth_rate, discount_rate, perpetual_growth_rate, years, initial_cash_flow)
    return jsonify(result)

@app.route('/get_initial_cash_flow/<ticker>')
def get_initial_cash_flow(ticker):
    try:
        company = yf.Ticker(ticker)
        financials = company.cashflow
        
        if financials.empty:
            return jsonify({"error": "No financial data available for this ticker"})
        
        try:
            fcf = financials.loc['Free Cash Flow'][0]  # Most recent year
            source = 'Free Cash Flow'
        except:
            try:
                # Fallback to Operating Cash Flow if FCF is not available
                fcf = financials.loc['Operating Cash Flow'][0]
                source = 'Operating Cash Flow'
            except:
                return jsonify({"error": "No cash flow data available for this ticker"})
        
        # Get the year for the cash flow
        year = financials.columns[0].year
        
        # Calculate value in 100M units
        fcf_in_100m = fcf / 100000000
        
        return jsonify({
            "initial_cash_flow": fcf,
            "initial_cash_flow_100m": fcf_in_100m,
            "source": source,
            "year": year
        })
    except Exception as e:
        return jsonify({"error": f"Error fetching data: {str(e)}"})

if __name__ == '__main__':
    app.run(debug=True) 