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

  const addToCart = (plan, quantity = 1) => {
    setCartItems(prev => {
      // Check if already in cart
      const existingIndex = prev.findIndex(item => item.id === plan.id);
      if (existingIndex >= 0) {
        // Update quantity instead of adding duplicate
        const newItems = [...prev];
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity + quantity
        };
        return newItems;
      }
      return [...prev, {
        id: plan.id || plan._id,
        title: plan.title,
        price: plan.offerPrice || plan.creditCost || 0,
        originalPrice: plan.originalPrice,
        icon: plan.icon,
        featureImage: plan.featureImage,
        categoryName: plan.categoryName,
        quantity: quantity
      }];
    });
  };

  const updateCartItemQuantity = (planId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(planId);
      return;
    }
    setCartItems(prev => {
      return prev.map(item => 
        item.id === planId ? { ...item, quantity: newQuantity } : item
      );
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

  const getCartItemQuantity = (planId) => {
    const item = cartItems.find(item => item.id === planId);
    return item ? item.quantity : 0;
  };

  const cartTotal = cartItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
  const cartCount = cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

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
      updateCartItemQuantity,
      getCartItemQuantity,
    }}>
      {children}
    </CartContext.Provider>
  );
};

export default CartContext;
