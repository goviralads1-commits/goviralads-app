import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cart');
      if (saved) {
        setCartItems(JSON.parse(saved));
      }
    } catch (err) {
      console.error('Failed to load cart:', err);
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('cart', JSON.stringify(cartItems));
    } catch (err) {
      console.error('Failed to save cart:', err);
    }
  }, [cartItems]);

  const addToCart = (plan) => {
    setCartItems(prev => {
      // Check if already in cart
      const exists = prev.find(item => item.id === plan.id);
      if (exists) {
        return prev; // Don't add duplicates
      }
      return [...prev, {
        id: plan.id || plan._id,
        title: plan.title,
        price: plan.offerPrice || plan.creditCost || 0,
        originalPrice: plan.originalPrice,
        icon: plan.icon,
        featureImage: plan.featureImage,
        categoryName: plan.categoryName,
      }];
    });
  };

  const removeFromCart = (planId) => {
    setCartItems(prev => prev.filter(item => item.id !== planId));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const isInCart = (planId) => {
    return cartItems.some(item => item.id === planId);
  };

  const cartTotal = cartItems.reduce((sum, item) => sum + (item.price || 0), 0);
  const cartCount = cartItems.length;

  return (
    <CartContext.Provider value={{
      cartItems,
      cartCount,
      cartTotal,
      isCartOpen,
      setIsCartOpen,
      addToCart,
      removeFromCart,
      clearCart,
      isInCart,
    }}>
      {children}
    </CartContext.Provider>
  );
};

export default CartContext;
