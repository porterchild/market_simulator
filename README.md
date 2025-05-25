# Stock Market Simulator

This project simulates a simple stock market where agents can place buy and sell orders. The simulation visualizes the order book at each tick and the price of the stock over time.

## Features

*   **Order Book:** Displays active buy and sell orders.
*   **Transaction Matching:** Orders are matched when buy and sell prices overlap.
*   **Random Agents:** Market participants (agents) randomly place orders around the current market price.
*   **Price Chart:** Visualizes the stock's price history.
*   **Tick-based Simulation:** The market updates in discrete time steps (ticks).

## How it Works

1.  **Initialization:** The simulation starts with an initial price and an empty order book.
2.  **Agent Actions:** At each tick, agents decide whether to buy or sell and at what price, placing their orders into the book. Orders are generated randomly around the current market price.
3.  **Order Matching:** The system continuously checks for overlapping buy and sell orders. If a buy order's price is greater than or equal to a sell order's price, a transaction occurs.
    *   **Price Priority:** Orders are matched based on price priority (highest bid, lowest ask).
    *   **Time Priority (for transaction price):** When a match occurs, the transaction price is determined by the price of the "standing" (older) order. If both matching orders arrived in the same tick (simultaneous), the transaction price is the midpoint of their prices.
    *   **Quantity:** Orders are filled up to the minimum of the transacting quantities. Partially filled orders remain in the book. Fully filled orders are removed.
4.  **Price Update:** The price of the last transaction in a tick becomes the new current price.
5.  **Visualization:** The order book and price chart are updated to reflect the current state of the market.
    *   **Simulation Speed vs. UI:** The simulation can run at a very high frequency (e.g., 10ms per tick), while UI updates are batched and rendered at a slower, fixed interval (e.g., every 100ms) for smoother visualization.

## Technologies

*   HTML
*   CSS (for basic styling)
*   JavaScript (for simulation logic and DOM manipulation)
*   Chart.js (for plotting the price chart)
*   Hammer.js (for chart pan functionality)
*   Chart.js Plugin Zoom (for chart zoom and pan functionality)
*   Custom Chart.js Plugin for Order Book Visualization (for horizontal order lines)

## Visualization Details

*   **Price Chart:** Displays the stock's price history. It is full-width and supports zoom (mouse wheel) and pan (click-and-drag) functionality.
*   **Order Book Lines:** Individual active orders (bids and asks) are visualized as horizontal lines on the price chart.
    *   **Color:** Green lines represent buy orders (bids), and red lines represent sell orders (asks).
    *   **Opacity:** The opacity of an order line is proportional to its quantity; larger orders appear more opaque.
    *   **Extension:** Each order line begins at the tick when the order was placed and extends to the current simulation tick, representing its active duration in the order book.

## Future Enhancements (Potential)

*   More sophisticated agent behaviors.
*   Different order types (e.g., limit, market).
*   Volume tracking.
*   User interaction to place orders.
