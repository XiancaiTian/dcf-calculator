function showLoading() {
    document.getElementById('loading-section').classList.remove('d-none');
    document.getElementById('results').classList.add('d-none');
}

function hideLoading() {
    document.getElementById('loading-section').classList.add('d-none');
}

function updateProgress(percent, status) {
    const progressBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('loading-status');
    
    progressBar.style.width = `${percent}%`;
    progressBar.setAttribute('aria-valuenow', percent);
    
    if (status) {
        statusText.textContent = status;
    }
}

// Add function to fetch initial cash flow
async function fetchInitialCashFlow(ticker) {
    const initialCashFlowInput = document.getElementById('initial-cash-flow');
    const initialCashFlowLabel = document.querySelector('label[for="initial-cash-flow"]');
    
    try {
        // Show loading state
        initialCashFlowLabel.innerHTML = 'Initial Cash Flow Value (100M $) <small class="text-muted">(Loading...)</small>';
        initialCashFlowInput.disabled = true;
        
        const response = await fetch(`/get_initial_cash_flow/${ticker}`);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        if (data.initial_cash_flow) {
            // Use the pre-calculated 100M value
            const valueIn100M = data.initial_cash_flow_100m.toFixed(2);
            initialCashFlowInput.value = valueIn100M;
            initialCashFlowLabel.innerHTML = `Initial Cash Flow Value (100M $) <small class="text-muted">(${data.source} from ${data.year})</small>`;
            
            // Also update the results table if it's visible
            const initialCashFlowResult = document.getElementById('initial-cash-flow-result');
            if (initialCashFlowResult) {
                initialCashFlowResult.textContent = `$${valueIn100M} (100M $)`;
            }
        }
    } catch (error) {
        console.error('Error fetching initial cash flow:', error);
        initialCashFlowLabel.innerHTML = 'Initial Cash Flow Value (100M $) <small class="text-danger">(Error loading data)</small>';
    } finally {
        initialCashFlowInput.disabled = false;
    }
}

// Add event listener for ticker input with debounce
let debounceTimer;
document.getElementById('ticker').addEventListener('input', (e) => {
    const ticker = e.target.value.toUpperCase();
    clearTimeout(debounceTimer);
    
    if (ticker) {
        debounceTimer = setTimeout(() => {
            fetchInitialCashFlow(ticker);
        }, 500); // Wait 500ms after typing stops
    }
});

// Add event listener for initial cash flow input
document.getElementById('initial-cash-flow').addEventListener('input', (e) => {
    const value = e.target.value;
    const initialCashFlowResult = document.getElementById('initial-cash-flow-result');
    
    // Update the results table if it's visible
    if (initialCashFlowResult) {
        initialCashFlowResult.textContent = value ? `$${value} (100M $)` : 'Not provided';
    }
});

// Add function to validate the form
function validateForm() {
    const ticker = document.getElementById('ticker').value.trim();
    const growthRate = document.getElementById('growth-rate').value.trim();
    const discountRate = document.getElementById('discount-rate').value.trim();
    const perpetualGrowthRate = document.getElementById('perpetual-growth-rate').value.trim();
    const years = document.getElementById('years').value.trim();
    
    // Check required fields
    if (!ticker) {
        alert('Please enter a stock ticker');
        return false;
    }
    
    if (!growthRate) {
        alert('Please enter an expected growth rate');
        return false;
    }
    
    if (!discountRate) {
        alert('Please enter a discount rate');
        return false;
    }
    
    if (!perpetualGrowthRate) {
        alert('Please enter a perpetual growth rate');
        return false;
    }
    
    if (!years) {
        alert('Please enter the number of projection years');
        return false;
    }
    
    // Initial cash flow is optional, so no validation needed
    
    return true;
}

document.getElementById('dcf-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Validate the form
    if (!validateForm()) {
        return;
    }
    
    // Get the initial cash flow value and convert from 100M units to original units
    const initialCashFlowInput = document.getElementById('initial-cash-flow');
    let initialCashFlowValue = null;
    
    // Only convert if the field has a value
    if (initialCashFlowInput.value && initialCashFlowInput.value.trim() !== '') {
        initialCashFlowValue = parseFloat(initialCashFlowInput.value) * 100000000;
    }
    
    const formData = {
        ticker: document.getElementById('ticker').value.toUpperCase(),
        growth_rate: document.getElementById('growth-rate').value,
        discount_rate: document.getElementById('discount-rate').value,
        perpetual_growth_rate: document.getElementById('perpetual-growth-rate').value,
        years: document.getElementById('years').value,
        initial_cash_flow: initialCashFlowValue
    };

    try {
        showLoading();
        updateProgress(20, 'Fetching company data...');

        const response = await fetch('/calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        updateProgress(60, 'Processing calculations...');

        const data = await response.json();
        
        updateProgress(80, 'Preparing results...');

        if (data.error) {
            throw new Error(data.error);
        }

        updateProgress(100, 'Complete!');

        setTimeout(() => {
            hideLoading();
            const resultsDiv = document.getElementById('results');
            resultsDiv.classList.remove('d-none');

            document.getElementById('company-name').textContent = data.company_name;
            document.getElementById('dcf-per-share').textContent = 
                `$${data.dcf_per_share.toFixed(2)}`;
            document.getElementById('current-price').textContent = 
                `$${data.current_price.toFixed(2)}`;
            document.getElementById('dcf-value').textContent = 
                `$${(data.dcf_value / 100000000).toFixed(2)} (100M $)`;
            document.getElementById('market-cap').textContent = 
                `$${(data.market_cap / 100000000).toFixed(2)} (100M $)`;

            document.getElementById('cash-flow-source').textContent = data.cash_flow_source;
            
            // Use the exact same value as the input field
            const initialCashFlowInputValue = document.getElementById('initial-cash-flow').value;
            document.getElementById('initial-cash-flow-result').textContent = 
                initialCashFlowInputValue ? `$${initialCashFlowInputValue} (100M $)` : 'Not provided';
            
            document.getElementById('shares-outstanding').textContent = 
                `${(data.shares_outstanding / 1e6).toFixed(2)} million`;
            document.getElementById('terminal-value').textContent = 
                `$${(data.terminal_value / 100000000).toFixed(2)} (100M $)`;

            const projectedValuesBody = document.getElementById('projected-values');
            projectedValuesBody.innerHTML = '';
            
            for (let i = 0; i < data.projected_values.year.length; i++) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>Year ${data.projected_values.year[i]}</td>
                    <td>$${(data.projected_values.cash_flows[i] / 100000000).toFixed(2)} (100M $)</td>
                    <td>$${(data.projected_values.present_values[i] / 100000000).toFixed(2)} (100M $)</td>
                `;
                projectedValuesBody.appendChild(row);
            }

            const difference = ((data.dcf_per_share - data.current_price) / data.current_price * 100).toFixed(2);
            const analysis = difference > 0 
                ? `The stock appears to be undervalued by ${difference}%. The calculated fair value is $${data.dcf_per_share.toFixed(2)} compared to the current price of $${data.current_price.toFixed(2)}.`
                : `The stock appears to be overvalued by ${Math.abs(difference)}%. The calculated fair value is $${data.dcf_per_share.toFixed(2)} compared to the current price of $${data.current_price.toFixed(2)}.`;
            
            document.getElementById('analysis').textContent = analysis;

            // Update valuation metrics
            const metrics = data.valuation_metrics;
            
            // Update PE Ratio
            if (metrics.pe_ratio) {
                document.getElementById('pe-ratio').textContent = metrics.pe_ratio.toFixed(2);
                
                // Update PE percentile
                if (metrics.pe_percentile !== null && metrics.pe_percentile !== undefined) {
                    document.getElementById('pe-percentile').textContent = 
                        `${metrics.pe_percentile.toFixed(0)}th percentile`;
                    document.getElementById('pe-percentile-bar').style.width = 
                        `${metrics.pe_percentile}%`;
                } else {
                    document.getElementById('pe-percentile').textContent = 'Not available';
                }
                
                // Update historical PE percentile
                if (metrics.pe_historical_percentile !== null && metrics.pe_historical_percentile !== undefined) {
                    document.getElementById('pe-historical-percentile').textContent = 
                        `${metrics.pe_historical_percentile.toFixed(0)}th percentile`;
                } else {
                    document.getElementById('pe-historical-percentile').textContent = 'Not available';
                }

                // Update industry average PE
                if (metrics.industry_avg_pe !== null && metrics.industry_avg_pe !== undefined) {
                    document.getElementById('industry-avg-pe').textContent = metrics.industry_avg_pe.toFixed(2);
                } else {
                    document.getElementById('industry-avg-pe').textContent = 'Not available';
                }
            } else {
                document.getElementById('pe-ratio').textContent = 'Not available';
                document.getElementById('pe-percentile').textContent = 'Not available';
                document.getElementById('pe-historical-percentile').textContent = 'Not available';
                document.getElementById('industry-avg-pe').textContent = 'Not available';
            }

            // Update PB Ratio
            if (metrics.pb_ratio) {
                document.getElementById('pb-ratio').textContent = metrics.pb_ratio.toFixed(2);
                
                // Update PB percentile
                if (metrics.pb_percentile !== null && metrics.pb_percentile !== undefined) {
                    document.getElementById('pb-percentile').textContent = 
                        `${metrics.pb_percentile.toFixed(0)}th percentile`;
                    document.getElementById('pb-percentile-bar').style.width = 
                        `${metrics.pb_percentile}%`;
                } else {
                    document.getElementById('pb-percentile').textContent = 'Not available';
                }
                
                // Update historical PB percentile
                if (metrics.pb_historical_percentile !== null && metrics.pb_historical_percentile !== undefined) {
                    document.getElementById('pb-historical-percentile').textContent = 
                        `${metrics.pb_historical_percentile.toFixed(0)}th percentile`;
                } else {
                    document.getElementById('pb-historical-percentile').textContent = 'Not available';
                }

                // Update industry average PB
                if (metrics.industry_avg_pb !== null && metrics.industry_avg_pb !== undefined) {
                    document.getElementById('industry-avg-pb').textContent = metrics.industry_avg_pb.toFixed(2);
                } else {
                    document.getElementById('industry-avg-pb').textContent = 'Not available';
                }
            } else {
                document.getElementById('pb-ratio').textContent = 'Not available';
                document.getElementById('pb-percentile').textContent = 'Not available';
                document.getElementById('pb-historical-percentile').textContent = 'Not available';
                document.getElementById('industry-avg-pb').textContent = 'Not available';
            }

            // Update sector
            if (metrics.sector) {
                document.getElementById('total_dcf_value').textContent = metrics.sector;
            } else {
                document.getElementById('total_dcf_value').textContent = 'Not available';
            }

            // Update external links
            if (metrics.futu_link) {
                const futuLink = document.getElementById('futu-link');
                futuLink.href = metrics.futu_link;
                futuLink.classList.remove('d-none');
            } else {
                document.getElementById('futu-link').classList.add('d-none');
            }

            // Update Yahoo Finance link
            const ticker = document.getElementById('ticker').value.toUpperCase();
            const yahooLink = document.getElementById('yahoo-link');
            yahooLink.href = `https://finance.yahoo.com/quote/${ticker}`;

        }, 500);

    } catch (error) {
        hideLoading();
        const resultsDiv = document.getElementById('results');
        resultsDiv.classList.remove('d-none');
        resultsDiv.innerHTML = `
            <div class="card-body">
                <div class="error-message">
                    Error: ${error.message}
                </div>
            </div>
        `;
    }
}); 