# DCF Calculator

A web-based Discounted Cash Flow (DCF) calculator that helps investors evaluate stocks based on their intrinsic value.

## Features

- Calculate DCF value based on projected cash flows
- Compare current market price with calculated fair value
- View historical and industry valuation metrics (P/E and P/B ratios)
- Analyze company's valuation relative to industry peers
- Project future cash flows with customizable growth rates

## Technologies Used

- **Backend**: Python, Flask
- **Frontend**: HTML, CSS, JavaScript, Bootstrap
- **Data Source**: Yahoo Finance API (yfinance)

## How to Use

1. Enter a stock ticker symbol (e.g., AAPL, MSFT)
2. Adjust growth rate, discount rate, and perpetual growth rate as needed
3. Set the number of projection years
4. Click "Calculate DCF" to see the results

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/dcf-calculator.git
   cd dcf-calculator
   ```

2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Run the application:
   ```
   python app.py
   ```

4. Open your browser and navigate to `http://localhost:5000`

## Live Demo

Visit the live demo at: [DCF Calculator](https://yourusername.github.io/dcf-calculator)

## License

This project is licensed under the MIT License - see the LICENSE file for details. 