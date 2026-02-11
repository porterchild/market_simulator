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
    const newsBiasElement = document.getElementById('news-bias');
    const meanPriceSpan = document.getElementById('mean-price');

    // Simulation State
    let bids = []; // Array of { price: number, quantity: number, id: number, tickPlaced: number, tickTaken?: number }
    let asks = []; // Array of { price: number, quantity: number, id: number, tickPlaced: number, tickTaken?: number }
    let completedOrders = []; // Array of { price: number, quantity: number, id: number, tickPlaced: number, tickTaken: number }
    let currentPrice = 100.00; // Initial price
    let tick = 0;
    let priceHistory = [{ x: 0, y: currentPrice }];
    let simulationInterval;
    let orderIdCounter = 0;
    let simulationSpeed = 1000; // Default simulation speed
    const ORDER_BOOK_MAX_SIZE = 100; // Max combined orders (bids + asks)
    
    // News Bias Term
    let newsBias = null; // { direction: number, startTick: number, endTick: number }
    
    // Mean Reversion Bias Term
    let meanReversionBias = 0;
    
    // Running average for chart
    const averageWindow = 1000;
    let runningAverageHistory = [currentPrice];
    let priceWindow = [currentPrice];

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
            const allOrders = pluginOptions.allOrders || [];
            const maxQuantity = 10; // Max quantity for opacity calculation (orders are 1-10)
            const currentTick = chart.data.datasets[0].data.length > 0 ? chart.data.datasets[0].data[chart.data.datasets[0].data.length - 1].x : 0;

            ctx.save();

            allOrders.forEach(order => {
                // Determine the end tick for the line
                const endTick = order.tickTaken !== null ? order.tickTaken : currentTick;

                // Only draw if the order was placed before or at the current tick, and taken after or at the current tick
                // or if it's an active order
                if (order.tickPlaced <= currentTick && (order.tickTaken === null || order.tickTaken >= order.tickPlaced)) {
                    const y = yScale.getPixelForValue(order.price);
                    if (y >= chartArea.top && y <= chartArea.bottom) {
                        const opacity = Math.max(0.1, order.quantity / maxQuantity); // Min opacity to ensure visibility
                        const xStart = xScale.getPixelForValue(order.tickPlaced);
                        const xEnd = xScale.getPixelForValue(endTick);

                        // Ensure the line is within the visible x-range
                        const drawXStart = Math.max(xStart, chartArea.left);
                        const drawXEnd = Math.min(xEnd, chartArea.right);

                        if (drawXStart < drawXEnd) { // Only draw if there's a visible segment
                            ctx.strokeStyle = order.type === 'buy' ? `rgba(40, 167, 69, ${opacity})` : `rgba(220, 53, 69, ${opacity})`;
                            ctx.lineWidth = 1.5;
                            ctx.beginPath();
                            ctx.moveTo(drawXStart, y);
                            ctx.lineTo(drawXEnd, y);
                            ctx.stroke();
                        }
                    }
                }
            });

            ctx.restore();
        }
    };

    // Register the plugin
    Chart.register(orderBookPlugin);

    function getMinMaxOrderPrice(xMin, xMax) {
        let minPrice = Infinity;
        let maxPrice = -Infinity;

        // Filter price history based on visible x-range
        const visiblePriceHistory = priceHistory.filter(dataPoint => dataPoint.x >= xMin && dataPoint.x <= xMax);
        if (visiblePriceHistory.length > 0) {
            const historyPrices = visiblePriceHistory.map(dataPoint => dataPoint.y);
            minPrice = Math.min(minPrice, ...historyPrices);
            maxPrice = Math.max(maxPrice, ...historyPrices);
        }

        // Filter active bids based on visible x-range (only tickPlaced matters for active)
        const visibleBids = bids.filter(order => order.tickPlaced >= xMin && order.tickPlaced <= xMax);
        if (visibleBids.length > 0) {
            const bidPrices = visibleBids.map(order => order.price);
            minPrice = Math.min(minPrice, ...bidPrices);
            maxPrice = Math.max(maxPrice, ...bidPrices);
        }

        // Filter active asks based on visible x-range (only tickPlaced matters for active)
        const visibleAsks = asks.filter(order => order.tickPlaced >= xMin && order.tickPlaced <= xMax);
        if (visibleAsks.length > 0) {
            const askPrices = visibleAsks.map(order => order.price);
            minPrice = Math.min(minPrice, ...askPrices);
            maxPrice = Math.max(maxPrice, ...askPrices);
        }

        // Filter completed orders based on visible x-range
        // An order is visible if its placed tick or taken tick falls within the range,
        // or if it spans across the range.
        const visibleCompletedOrders = completedOrders.filter(order =>
            (order.tickPlaced >= xMin && order.tickPlaced <= xMax) ||
            (order.tickTaken !== null && order.tickTaken >= xMin && order.tickTaken <= xMax) ||
            (order.tickPlaced < xMin && order.tickTaken !== null && order.tickTaken > xMax)
        );
        if (visibleCompletedOrders.length > 0) {
            const completedPrices = visibleCompletedOrders.map(order => order.price);
            minPrice = Math.min(minPrice, ...completedPrices);
            maxPrice = Math.max(maxPrice, ...completedPrices);
        }

        // If no data points are visible, use a default range around the current price
        if (minPrice === Infinity || maxPrice === -Infinity) {
            minPrice = currentPrice * 0.9;
            maxPrice = currentPrice * 1.1;
        }

        // Add some padding to the min/max values
        const padding = (maxPrice - minPrice) * 0.1;
        minPrice = Math.max(0, minPrice - padding); // Ensure price doesn't go below 0
        maxPrice = maxPrice + padding;

        return { min: minPrice, max: maxPrice };
    }

    function initializeChart() {
        const ctx = priceChartCanvas.getContext('2d');
        if (priceChart) {
            priceChart.destroy();
        }

        const { min, max } = getMinMaxOrderPrice(0, tick);

        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Stock Price',
                    data: priceHistory,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    fill: false
                }, {
                    label: 'Mean Price (1000t)',
                    data: [],
                    borderColor: 'rgba(128, 128, 128, 0.6)',
                    borderWidth: 2,
                    tension: 0.1,
                    fill: false,
                    pointRadius: 0
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
                        },
                        min: min,
                        max: max
                    }
                },
                animation: {
                    duration: 0 // Disable animation for real-time updates
                },
                plugins: {
                    legend: {
                        display: true
                    },
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
        
        if (newsBias !== null) {
            const activeTicks = newsBias.endTick - tick;
            newsBiasElement.textContent = `NEWS: ${newsBias.direction === 1 ? 'Positive' : 'Negative'} (${activeTicks} ticks remaining)`;
            newsBiasElement.style.display = 'block';
            newsBiasElement.className = newsBias.direction === 1 ? 'news-positive' : 'news-negative';
        } else {
            newsBiasElement.style.display = 'none';
        }
        
        if (priceHistory.length > 0) {
            const relevantHistory = priceHistory.slice(-1000);
            const meanPrice = relevantHistory.reduce((sum, point) => sum + point.y, 0) / relevantHistory.length;
            meanPriceSpan.textContent = meanPrice.toFixed(2);
        }
    }

    function updatePriceChart() {
        if (priceChart) {
            const recentCount = 300;
            const decimation = 10;

            // Downsample price history
            const chartPriceData = [];
            if (priceHistory.length <= recentCount) {
                chartPriceData.push(...priceHistory);
            } else {
                const oldEnd = priceHistory.length - recentCount;
                for (let i = 0; i < oldEnd; i += decimation) {
                    chartPriceData.push(priceHistory[i]);
                }
                for (let i = oldEnd; i < priceHistory.length; i++) {
                    chartPriceData.push(priceHistory[i]);
                }
            }

            // Downsample average history
            const chartAverageData = [];
            if (runningAverageHistory.length <= recentCount) {
                for (let i = 0; i < runningAverageHistory.length; i++) {
                    chartAverageData.push({ x: priceHistory[i].x, y: runningAverageHistory[i] });
                }
            } else {
                const oldEnd = runningAverageHistory.length - recentCount;
                for (let i = 0; i < oldEnd; i += decimation) {
                    chartAverageData.push({ x: priceHistory[i].x, y: runningAverageHistory[i] });
                }
                for (let i = oldEnd; i < runningAverageHistory.length; i++) {
                    chartAverageData.push({ x: priceHistory[i].x, y: runningAverageHistory[i] });
                }
            }

            priceChart.data.datasets[0].data = chartPriceData;
            priceChart.data.datasets[1].data = chartAverageData;

            // Get current visible x-axis range
            const xMin = priceChart.scales.x.min;
            const xMax = priceChart.scales.x.max;

            // Update y-axis min/max based on visible data
            const { min, max } = getMinMaxOrderPrice(xMin, xMax);
            priceChart.options.scales.y.min = min;
            priceChart.options.scales.y.max = max;

            priceChart.update();
        }
    }

    function generateRandomOrder() {
        const type = Math.random() < 0.5 ? 'buy' : 'sell';
        // Base price fluctuates around current price with normal distribution std=5%
        const u1 = Math.random(), u2 = Math.random();
        const priceFluctuation = currentPrice * (Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 0.05);
        
        let biasEffect = 0;
        if (newsBias && tick >= newsBias.startTick && tick <= newsBias.endTick) {
            biasEffect = newsBias.direction * currentPrice * 0.02;
        }
        
        // Mean reversion pulls price towards the average of last 1000 ticks
        const meanReversionEffect = meanReversionBias * currentPrice * 0.03;
        
        let price = parseFloat((currentPrice + priceFluctuation + biasEffect + meanReversionEffect).toFixed(2));
        if (price <= 0) price = 0.01;

        const quantity = Math.floor(Math.random() * 10) + 1;
        orderIdCounter++;
        return { id: orderIdCounter, type, price, quantity, tickPlaced: tick, tickTaken: null };
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
                bestBid.tickTaken = tick; // Mark when the order was taken
                completedOrders.push(bids.splice(0, 1)[0]); // Move to completed orders
            }

            if (bestAsk.quantity === 0) {
                bestAsk.tickTaken = tick; // Mark when the order was taken
                completedOrders.push(asks.splice(0, 1)[0]); // Move to completed orders
            }
            // If an order is partially filled, it remains at the top of its book (bids[0] or asks[0])
            // and the loop continues to see if it can be matched further.
        }
        return transactionOccurred;
    }


    function runTick() {
        tick++;
        console.log(`--- Tick ${tick} ---`);

        // Check if news bias has expired
        if (newsBias !== null && tick > newsBias.endTick) {
            newsBias = null;
        }

        // Check for news bias activation
        if (newsBias === null && Math.random() < 1/500) {
            const duration = Math.floor(Math.random() * 500) + 1;
            newsBias = {
                direction: Math.random() < 0.5 ? 1 : -1,
                startTick: tick,
                endTick: tick + duration
            };
            console.log(`News bias activated: ${newsBias.direction === 1 ? 'positive' : 'negative'} news for ${duration} ticks`);
        }

        // Calculate mean reversion bias and track running average
        if (priceHistory.length > 0) {
            const lastPrice = priceHistory[priceHistory.length - 1].y;
            priceWindow.push(lastPrice);
            if (priceWindow.length > averageWindow) {
                priceWindow.shift();
            }
            const avgPrice = priceWindow.reduce((sum, price) => sum + price, 0) / priceWindow.length;
            runningAverageHistory.push(avgPrice);
            meanReversionBias = (avgPrice - currentPrice) / currentPrice;
        }

        // 1. Generate new orders (e.g., 1-3 new orders per tick)
        const numberOfNewOrders = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < numberOfNewOrders; i++) {
            const newOrder = generateRandomOrder();
            if (newOrder.type === 'buy') {
                bids.push(newOrder);
                // console.log(`New Buy Order: Price ${newOrder.price.toFixed(2)}, Qty ${newOrder.quantity}`);
            } else {
                asks.push(newOrder);
                // console.log(`New Sell Order: Price ${newOrder.price.toFixed(2)}, Qty ${newOrder.quantity}`);
            }
        }

        // Enforce max order book size
        while (bids.length + asks.length > ORDER_BOOK_MAX_SIZE) {
            if (bids.length > 0 && (Math.random() < 0.5 || asks.length === 0)) {
                // Randomly remove a bid
                const randomIndex = Math.floor(Math.random() * bids.length);
                bids.splice(randomIndex, 1);
            } else if (asks.length > 0) {
                // Randomly remove an ask
                const randomIndex = Math.floor(Math.random() * asks.length);
                asks.splice(randomIndex, 1);
            } else {
                // Should not happen if total > MAX_SIZE, but as a safeguard
                break;
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
                // Pass all orders (active and completed) to the plugin
                priceChart.options.plugins.orderBookLines.allOrders = [...bids, ...asks, ...completedOrders];
            }
            updatePriceChart(); // This will trigger the plugin's draw hook
            lastUiUpdateTime = currentTime;
        }

        console.log(`Bids: ${bids.length}, Asks: ${asks.length}, Current Price: ${currentPrice.toFixed(2)}`);
    }

    function startSimulation() {
        simulationSpeed = parseInt(tickSpeedInput.value, 10);
        if (isNaN(simulationSpeed) || simulationSpeed < 1) { // Minimum 1ms
            alert("Please enter a valid tick speed (minimum 1ms).");
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
