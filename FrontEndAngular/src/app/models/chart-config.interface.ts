export interface ChartColorConfig {
  price: {
    up: '#00FF41';      // Bright green for price increases
    down: '#FF1744';    // Bright red for price decreases
    wick: {
      up: '#00FF41';
      down: '#FF1744';
    };
  };
  volume: {
    buyDominant: '#2196F3';    // Blue when more buys than sells
    sellDominant: '#FF9500';   // Orange when more sells than buys
    gradient: {
      buyStart: '#1976D2';     // Darker blue for gradient start
      buyEnd: '#2196F3';       // Bright blue for gradient end
      sellStart: '#F57C00';    // Darker orange for gradient start
      sellEnd: '#FF9500';      // Bright orange for gradient end
    };
  };
  background: '#1a1a1a';       // Dark background to make colors pop
  grid: '#333333';             // Subtle grid lines
  text: '#FFFFFF';             // White text for contrast
}
