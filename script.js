document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const startButton = document.getElementById('start-simulation');
    const stopButton = document.getElementById('stop-simulation');
    const tickSpeedInput = document.getElementById('tick-speed');
    let uiUpdateInterval = 100; // milliseconds
    let lastUiUpdateTime = 0;
    const buyOrdersUl = document.getElementById('buy-orders');
    const sellOrdersUl = document.getElementById('sell-orders');
    const currentPriceSpan = document.getElementById('current-price');
    const currentTickSpan = document.getElementById('current-tick');
    const priceChartCanvas = document.getElementById('price-chart');

    // Simulation State
    let bids = []; // Array of { price: number, quantity: number, id: number }
    let asks = []; // Array of { price: number, quantity: number, id: number }
    let currentPrice = 100.00; // Initial price
    let tick = 0;
    let priceHistory = [{ x: 0, y: currentPrice }];
    let simulationInterval;
    let orderIdCounter = 0;
    let simulationSpeed = 1000; // Default simulation speed

    // Chart.js Instance
    let priceChart;

    // Custom Chart.js Plugin for Order Book Visualization
    const orderBookPlugin = {
        id: 'orderBookLines',
        beforeDraw: (chart) => {
            const ctx = chart.ctx;
            const chartArea = chart.chartArea;
            const xScale = chart.scales.x;
            const yScale = chart.scales.y;

            // Get order data from chart options (plugin options)
            const pluginOptions = chart.options.plugins.orderBookLines || {};
            const bids = pluginOptions.bids || [];
            const asks = pluginOptions.asks || [];
            const maxQuantity = 10; // Max quantity for opacity calculation (orders are 1-10)

            ctx.save();

            // Draw Bids (Green Lines)
            bids.forEach(order => {
                if (order.quantity <= 0) return; // Do not draw lines for orders with zero or negative quantity

                const y = yScale.getPixelForValue(order.price);
                if (y >= chartArea.top && y <= chartArea.bottom) {
                    const opacity = Math.max(0.1, order.quantity / maxQuantity); // Min opacity to ensure visibility
                    const xStart = xScale.getPixelForValue(order.tickPlaced);
                    // Only draw if the start of the line is within the chart area
                    if (xStart <= chartArea.right && typeof xStart === 'number' && !isNaN(xStart)) {
                        ctx.strokeStyle = `rgba(40, 167, 69, ${opacity})`; // Green color
                        ctx.lineWidth = 1.5; // Slightly thicker lines
                        ctx.beginPath();
                        // Start the line from its tickPlaced, or chartArea.left if tickPlaced is out of view to the left
                        ctx.moveTo(Math.max(xStart, chartArea.left), y);
                        ctx.lineTo(chartArea.right, y); // Extend to the right edge of the chart
                        ctx.stroke();
                    }
                }
            });

            // Draw Asks (Red Lines)
            asks.forEach(order => {
                if (order.quantity <= 0) return; // Do not draw lines for orders with zero or negative quantity

                const y = yScale.getPixelForValue(order.price);
                if (y >= chartArea.top && y <= chartArea.bottom) {
                    const opacity = Math.max(0.1, order.quantity / maxQuantity); // Min opacity to ensure visibility
                    const xStart = xScale.getPixelForValue(order.tickPlaced);
                    // Only draw if the start of the line is within the chart area
                    if (xStart <= chartArea.right && typeof xStart === 'number' && !isNaN(xStart)) {
                        ctx.strokeStyle = `rgba(220, 53, 69, ${opacity})`; // Red color
                        ctx.lineWidth = 1.5; // Slightly thicker lines
                        ctx.beginPath();
                        // Start the line from its tickPlaced, or chartArea.left if tickPlaced is out of view to the left
                        ctx.moveTo(Math.max(xStart, chartArea.left), y);
                        ctx.lineTo(chartArea.right, y); // Extend to the right edge of the chart
                        ctx.stroke();
                    }
                }
            });

            ctx.restore();
        }
    };

    // Register the plugin
    Chart.register(orderBookPlugin);

    function initializeChart() {
        const ctx = priceChartCanvas.getContext('2d');
        if (priceChart) {
            priceChart.destroy();
        }
        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Stock Price',
                    data: priceHistory,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    fill: false
                }]
            },
            options: {
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: 'Tick'
                        },
                        // Configuration for zoom/pan
                        // min and max are handled by chartjs-plugin-zoom
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Price'
                        }
                    }
                },
                animation: {
                    duration: 0 // Disable animation for real-time updates
                },
                plugins: {
                    zoom: {
                        zoom: {
                            wheel: {
                                enabled: true,
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x',
                        },
                        pan: {
                            enabled: true,
                            mode: 'x',
                        }
                    },
                    orderBookLines: {
                        bids: [], // Initialize with empty arrays
                        asks: []
                    }
                }
            }
        });
    }

    function updateOrderBookDisplay() {
        // Sort bids: highest price first
        bids.sort((a, b) => b.price - a.price);
        // Sort asks: lowest price first
        asks.sort((a, b) => a.price - b.price);

        buyOrdersUl.innerHTML = '';
        bids.forEach(order => {
            const li = document.createElement('li');
            li.textContent = `Price: ${order.price.toFixed(2)} - Qty: ${order.quantity}`;
            buyOrdersUl.appendChild(li);
        });

        sellOrdersUl.innerHTML = '';
        asks.forEach(order => {
            const li = document.createElement('li');
            li.textContent = `Price: ${order.price.toFixed(2)} - Qty: ${order.quantity}`;
            sellOrdersUl.appendChild(li);
        });
    }

    function updateCurrentInfo() {
        currentPriceSpan.textContent = currentPrice.toFixed(2);
        currentTickSpan.textContent = tick;
    }

    function updatePriceChart() {
        if (priceChart) {
            priceChart.data.datasets[0].data = priceHistory;
            priceChart.update();
        }
    }

    function generateRandomOrder() {
        const type = Math.random() < 0.5 ? 'buy' : 'sell';
        // Price fluctuates around the current price by +/- 5% (example)
        const priceFluctuation = currentPrice * (Math.random() * 0.10 - 0.05);
        let price = parseFloat((currentPrice + priceFluctuation).toFixed(2));
        if (price <= 0) price = 0.01; // Ensure price is positive

        const quantity = Math.floor(Math.random() * 10) + 1; // Quantity between 1 and 10
        orderIdCounter++;
        return { id: orderIdCounter, type, price, quantity, tickPlaced: tick }; // Add tickPlaced
    }

    function matchOrders() {
        let transactionOccurred = false;
        // Ensure bids are sorted high to low, asks low to high for matching
        bids.sort((a, b) => b.price - a.price); // Highest bid price first
        asks.sort((a, b) => a.price - b.price); // Lowest ask price first

        // Note: transactionOccurred is already declared at the top of the function.
        // The duplicate 'let transactionOccurred = false;' was removed here.

        // Loop as long as there are orders on both sides and the best bid can meet the best ask
        while (bids.length > 0 && asks.length > 0 && bids[0].price >= asks[0].price) {
            const bestBid = bids[0];
            const bestAsk = asks[0];

            // Transaction can occur
            // Determine transaction price based on which order is "standing" (older).
            let transactionPrice;
            if (bestBid.tickPlaced > bestAsk.tickPlaced) {
                // Bid is newer (aggressor), Ask is standing. Trade at Ask's price.
                transactionPrice = bestAsk.price;
            } else if (bestAsk.tickPlaced > bestBid.tickPlaced) {
                // Ask is newer (aggressor), Bid is standing. Trade at Bid's price.
                transactionPrice = bestBid.price;
            } else {
                // Orders arrived in the same tick and crossed. Use midpoint.
                // This is a compromise for simultaneous arrivals.
                transactionPrice = (bestBid.price + bestAsk.price) / 2;
            }
            const transactionQuantity = Math.min(bestBid.quantity, bestAsk.quantity);

            console.log(`Transaction: ${transactionQuantity} units at ${transactionPrice.toFixed(2)}`);

            bestBid.quantity -= transactionQuantity;
            bestAsk.quantity -= transactionQuantity;

            currentPrice = transactionPrice; // Update current market price
            transactionOccurred = true;

            if (bestBid.quantity === 0) {
                bids.splice(0, 1); // Remove filled bid from the top
            }

            if (bestAsk.quantity === 0) {
                asks.splice(0, 1); // Remove filled ask from the top
            }
            // If an order is partially filled, it remains at the top of its book (bids[0] or asks[0])
            // and the loop continues to see if it can be matched further.
        }
        return transactionOccurred;
    }


    function runTick() {
        tick++;
        console.log(`--- Tick ${tick} ---`);

        // 1. Generate new orders (e.g., 1-3 new orders per tick)
        const numberOfNewOrders = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < numberOfNewOrders; i++) {
            const newOrder = generateRandomOrder();
            if (newOrder.type === 'buy') {
                bids.push(newOrder);
                console.log(`New Buy Order: Price ${newOrder.price.toFixed(2)}, Qty ${newOrder.quantity}`);
            } else {
                asks.push(newOrder);
                console.log(`New Sell Order: Price ${newOrder.price.toFixed(2)}, Qty ${newOrder.quantity}`);
            }
        }

        // 2. Match orders
        const transactionMade = matchOrders();

        // 3. Update price history
        // Add to price history every tick
        priceHistory.push({ x: tick, y: currentPrice });

        // Update UI only if enough time has passed
        const currentTime = Date.now();
        if (currentTime - lastUiUpdateTime >= uiUpdateInterval) {
            updateOrderBookDisplay();
            updateCurrentInfo();

            // Update order book data for the custom plugin
            if (priceChart && priceChart.options && priceChart.options.plugins && priceChart.options.plugins.orderBookLines) {
                priceChart.options.plugins.orderBookLines.bids = [...bids]; // Pass copies to avoid issues
                priceChart.options.plugins.orderBookLines.asks = [...asks];
            }
            updatePriceChart(); // This will trigger the plugin's draw hook
            lastUiUpdateTime = currentTime;
        }

        console.log(`Bids: ${bids.length}, Asks: ${asks.length}, Current Price: ${currentPrice.toFixed(2)}`);
    }

    function startSimulation() {
        simulationSpeed = parseInt(tickSpeedInput.value, 10);
        if (isNaN(simulationSpeed) || simulationSpeed < 10) { // Minimum 10ms
            alert("Please enter a valid tick speed (minimum 10ms).");
            return;
        }

        if (simulationInterval) {
            clearInterval(simulationInterval);
        }

        // Reset UI update timer
        lastUiUpdateTime = Date.now();

        // Reset state for a new simulation run if needed (or allow continuation)
        // For now, let's allow continuation. If a full reset is desired:
        // bids = [];
        // asks = [];
        // currentPrice = 100.00;
        // tick = 0;
        // priceHistory = [{ x: 0, y: currentPrice }];
        // orderIdCounter = 0;
        // initializeChart(); // Re-initialize chart with reset data

        simulationInterval = setInterval(runTick, simulationSpeed);
        startButton.disabled = true;
        stopButton.disabled = false;
        tickSpeedInput.disabled = true;
        console.log(`Simulation started with tick speed: ${simulationSpeed}ms`);
    }

    function stopSimulation() {
        if (simulationInterval) {
            clearInterval(simulationInterval);
            simulationInterval = null;
        }
        startButton.disabled = false;
        stopButton.disabled = true;
        tickSpeedInput.disabled = false;
        console.log("Simulation stopped.");
    }

    // Event Listeners
    startButton.addEventListener('click', startSimulation);
    stopButton.addEventListener('click', stopSimulation);

    // Initial Setup
    initializeChart();
    updateOrderBookDisplay();
    updateCurrentInfo();
});
