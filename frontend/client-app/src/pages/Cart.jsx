import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import api from '../services/api';
import Header from '../components/Header';

const Cart = () => {
  const navigate = useNavigate();
  const { cartItems, cartTotal, removeFromCart, clearCart } = useCart();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [toast, setToast] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);

  // Fetch wallet balance on mount
  React.useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await api.get('/client/wallet');
        setWalletBalance(res.data.balance);
      } catch (err) {
        console.error('Failed to fetch wallet:', err);
      }
    };
    fetchBalance();
  }, []);

  const handleProceedToCheckout = () => {
    if (cartItems.length === 0) {
      setToast({ type: 'error', message: 'Your cart is empty' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmPurchase = async () => {
    setPurchasing(true);

    try {
      // Use batch purchase endpoint
      const planIds = cartItems.map(item => item.id);
      const response = await api.post('/client/purchase-cart', { planIds });

      setShowConfirmModal(false);
      setPurchasing(false);
      clearCart();

      setToast({ 
        type: 'success', 
        message: `${response.data.tasks.length} plan(s) purchased successfully!` 
      });

      // Update wallet balance display
      setWalletBalance(response.data.walletBalance);

      setTimeout(() => {
        setToast(null);
        navigate('/tasks');
      }, 2000);
    } catch (err) {
      setShowConfirmModal(false);
      setPurchasing(false);

      setToast({ 
        type: 'error', 
        message: err.response?.data?.error || 'Failed to purchase cart'
      });
      setTimeout(() => setToast(null), 5000);
    }
  };

  const insufficientBalance = walletBalance !== null && walletBalance < cartTotal;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', paddingBottom: '140px' }}>
      <Header />
      
      {/* Toast */}
      {toast && (
        <div style={{ 
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', 
          backgroundColor: toast.type === 'error' ? '#dc3545' : '#28a745', 
          color: '#fff', padding: '14px 28px', borderRadius: '16px', 
          fontSize: '14px', fontWeight: '600', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', 
          zIndex: 1000, maxWidth: '90%', textAlign: 'center'
        }}>
          {toast.message}
        </div>
      )}

      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <button 
            onClick={() => navigate('/plans')} 
            style={{ 
              padding: '12px 18px', backgroundColor: '#fff', border: 'none', borderRadius: '14px', 
              fontSize: '14px', fontWeight: '600', color: '#495057', cursor: 'pointer', 
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Continue Shopping
          </button>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a2e', margin: 0 }}>
            Your Cart ({cartItems.length})
          </h1>
        </div>

        {/* Empty Cart */}
        {cartItems.length === 0 ? (
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>🛒</div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e', marginBottom: '12px' }}>Your cart is empty</h2>
            <p style={{ fontSize: '15px', color: '#6c757d', marginBottom: '28px' }}>Browse our plans and add items to your cart</p>
            <button 
              onClick={() => navigate('/plans')} 
              style={{ padding: '14px 32px', backgroundColor: '#28a745', color: '#fff', fontSize: '15px', fontWeight: '600', borderRadius: '14px', border: 'none', cursor: 'pointer' }}
            >
              Browse Plans
            </button>
          </div>
        ) : (
          <>
            {/* Cart Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {cartItems.map(item => (
                <div key={item.id} style={{ 
                  backgroundColor: '#fff', borderRadius: '20px', padding: '20px', 
                  boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', gap: '16px', alignItems: 'center'
                }}>
                  {/* Image/Icon */}
                  <div style={{ 
                    width: '80px', height: '80px', borderRadius: '14px', backgroundColor: '#f8f9fa', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden'
                  }}>
                    {item.featureImage ? (
                      <img src={item.featureImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '32px' }}>{item.icon || '📦'}</span>
                    )}
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 6px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </h3>
                    {item.categoryName && (
                      <span style={{ fontSize: '12px', color: '#6c757d' }}>{item.categoryName}</span>
                    )}
                    <div style={{ marginTop: '8px' }}>
                      {item.originalPrice && item.originalPrice > item.price && (
                        <span style={{ fontSize: '13px', color: '#adb5bd', textDecoration: 'line-through', marginRight: '8px' }}>
                          ₹{item.originalPrice}
                        </span>
                      )}
                      <span style={{ fontSize: '18px', fontWeight: '700', color: '#28a745' }}>
                        ₹{item.price}
                      </span>
                    </div>
                  </div>

                  {/* Remove Button */}
                  <button 
                    onClick={() => removeFromCart(item.id)}
                    style={{ 
                      width: '40px', height: '40px', borderRadius: '12px', 
                      backgroundColor: '#fef2f2', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc3545" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Wallet Balance Warning */}
            {insufficientBalance && (
              <div style={{ 
                padding: '16px 20px', backgroundColor: '#fef2f2', borderRadius: '14px', 
                border: '1px solid #fecaca', marginBottom: '20px'
              }}>
                <p style={{ margin: 0, fontSize: '14px', color: '#dc2626', fontWeight: '600' }}>
                  ⚠️ Insufficient wallet balance
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#ef4444' }}>
                  You need ₹{(cartTotal - walletBalance).toLocaleString()} more to complete this purchase
                </p>
                <button 
                  onClick={() => navigate('/wallet')} 
                  style={{ marginTop: '12px', padding: '10px 20px', backgroundColor: '#dc2626', color: '#fff', fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: 'none', cursor: 'pointer' }}
                >
                  Recharge Wallet
                </button>
              </div>
            )}

            {/* Order Summary */}
            <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 16px 0' }}>Order Summary</h3>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ color: '#6c757d' }}>Items ({cartItems.length})</span>
                <span style={{ fontWeight: '600', color: '#1a1a2e' }}>₹{cartTotal.toLocaleString()}</span>
              </div>
              
              {walletBalance !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ color: '#6c757d' }}>Wallet Balance</span>
                  <span style={{ fontWeight: '600', color: walletBalance >= cartTotal ? '#28a745' : '#dc3545' }}>
                    ₹{walletBalance.toLocaleString()}
                  </span>
                </div>
              )}

              <div style={{ borderTop: '2px solid #f1f3f5', paddingTop: '16px', marginTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a2e' }}>Total</span>
                <span style={{ fontSize: '24px', fontWeight: '800', color: '#28a745' }}>₹{cartTotal.toLocaleString()}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Fixed Bottom CTA - positioned above nav bar */}
      {cartItems.length > 0 && (
        <div style={{ 
          position: 'fixed', bottom: '64px', left: 0, right: 0, 
          backgroundColor: '#fff', 
          padding: '16px 20px', 
          boxShadow: '0 -4px 24px rgba(0,0,0,0.1)', zIndex: 100
        }}>
          <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '2px' }}>Total ({cartItems.length} items)</div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: '#28a745' }}>₹{cartTotal.toLocaleString()}</div>
            </div>
            <button
              onClick={handleProceedToCheckout}
              disabled={insufficientBalance}
              style={{
                flex: 1.5, padding: '18px 24px', 
                backgroundColor: insufficientBalance ? '#6c757d' : '#28a745', 
                color: '#fff', fontSize: '16px', fontWeight: '700', borderRadius: '16px', border: 'none',
                cursor: insufficientBalance ? 'not-allowed' : 'pointer', 
                boxShadow: insufficientBalance ? 'none' : '0 6px 20px rgba(40,167,69,0.4)'
              }}
            >
              Proceed to Checkout
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div style={{ 
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          zIndex: 1001, padding: '20px'
        }}>
          <div style={{ 
            backgroundColor: '#fff', borderRadius: '24px', padding: '32px', 
            maxWidth: '440px', width: '100%', maxHeight: '80vh', overflowY: 'auto'
          }}>
            <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#1a1a2e', margin: '0 0 8px 0', textAlign: 'center' }}>
              Confirm Purchase
            </h2>
            <p style={{ fontSize: '14px', color: '#6c757d', margin: '0 0 24px 0', textAlign: 'center' }}>
              Are you sure you want to purchase these plans?
            </p>

            {/* Items List */}
            <div style={{ backgroundColor: '#f8f9fa', borderRadius: '16px', padding: '16px', marginBottom: '20px' }}>
              {cartItems.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e9ecef' }}>
                  <span style={{ fontSize: '14px', color: '#1a1a2e', fontWeight: '500' }}>{item.title}</span>
                  <span style={{ fontSize: '14px', color: '#28a745', fontWeight: '600' }}>₹{item.price}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', marginTop: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a2e' }}>Total</span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#28a745' }}>₹{cartTotal.toLocaleString()}</span>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#6c757d', textAlign: 'center', marginBottom: '24px' }}>
              Credits will be deducted from your wallet immediately
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setShowConfirmModal(false)}
                disabled={purchasing}
                style={{ 
                  flex: 1, padding: '14px', backgroundColor: '#f1f3f5', color: '#495057', 
                  fontSize: '15px', fontWeight: '600', borderRadius: '12px', border: 'none', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmPurchase}
                disabled={purchasing}
                style={{ 
                  flex: 1.5, padding: '14px', 
                  backgroundColor: purchasing ? '#6c757d' : '#28a745', 
                  color: '#fff', fontSize: '15px', fontWeight: '700', borderRadius: '12px', border: 'none', 
                  cursor: purchasing ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}
              >
                {purchasing ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                    </svg>
                    Processing...
                  </>
                ) : (
                  'Confirm Purchase'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Cart;
