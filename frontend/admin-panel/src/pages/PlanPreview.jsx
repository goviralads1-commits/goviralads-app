import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const PlanPreview = () => {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlanPreview();
  }, [planId]);

  const fetchPlanPreview = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/admin/plans/${planId}/preview`);
      setPlan(res.data.plan);
    } catch (err) {
      console.error('Failed to fetch plan preview:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <Header />
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '48px', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
            <p style={{ color: '#64748b' }}>Loading preview...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <Header />
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '48px', textAlign: 'center' }}>
            <p style={{ color: '#64748b' }}>Plan not found</p>
            <button onClick={() => navigate('/plans')} style={{ marginTop: '16px', padding: '12px 24px', backgroundColor: '#6366f1', color: '#fff', borderRadius: '12px', border: 'none', cursor: 'pointer' }}>
              Back to Plans
            </button>
          </div>
        </div>
      </div>
    );
  }

  const mediaArray = Array.isArray(plan.planMedia) ? plan.planMedia : [];
  const coverMedia = mediaArray[0] || { type: 'image', url: plan.featureImage };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Header />
      
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px', paddingBottom: '100px' }}>
        {/* Back Button */}
        <button
          onClick={() => navigate('/plans')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', marginBottom: '24px', fontWeight: '500', color: '#475569' }}
        >
          <span style={{ fontSize: '16px' }}>←</span>
          Back to Plans
        </button>

        {/* Preview Badge */}
        <div style={{ backgroundColor: '#eff6ff', color: '#3b82f6', padding: '12px 20px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center', fontSize: '14px', fontWeight: '600', border: '2px solid #bfdbfe' }}>
          📱 Client Preview - This is how clients see this plan
        </div>

        {/* Status & Visibility Info */}
        <div style={{ display: 'grid', gridTemplateColumns: plan.visibility !== 'PUBLIC' ? 'repeat(2, 1fr)' : '1fr', gap: '12px', marginBottom: '20px' }}>
          {/* Status */}
          <div style={{ backgroundColor: plan.isActivePlan ? '#ecfdf5' : '#fef2f2', padding: '12px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: '600', color: plan.isActivePlan ? '#16a34a' : '#dc2626', border: `2px solid ${plan.isActivePlan ? '#a7f3d0' : '#fecaca'}`, textAlign: 'center' }}>
            {plan.isActivePlan ? '✓ Live' : '⏸ Hidden'}
          </div>
          
          {/* Visibility Info */}
          {plan.visibility !== 'PUBLIC' && (
            <div style={{ backgroundColor: plan.visibility === 'HIDDEN' ? '#fef2f2' : '#fffbeb', padding: '12px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: '500', color: plan.visibility === 'HIDDEN' ? '#dc2626' : '#f59e0b', border: `2px solid ${plan.visibility === 'HIDDEN' ? '#fecaca' : '#fde68a'}`, textAlign: 'center' }}>
              {plan.visibility === 'HIDDEN' ? '🔒 Hidden' : `👥 ${plan.allowedClients.length} Client(s)`}
            </div>
          )}
        </div>

        {/* Plan Card */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          {/* Media */}
          {coverMedia && (
            <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', backgroundColor: '#f1f5f9' }}>
              {coverMedia.type === 'video' ? (
                <video
                  src={coverMedia.url}
                  controls
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <img
                  src={coverMedia.url}
                  alt={plan.title}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
            </div>
          )}

          {/* Content */}
          <div style={{ padding: '32px' }}>
            {/* Category Badge */}
            {plan.categoryName && (
              <div style={{ display: 'inline-block', padding: '6px 14px', backgroundColor: `${plan.categoryColor}15`, color: plan.categoryColor, fontSize: '12px', fontWeight: '600', borderRadius: '20px', marginBottom: '16px' }}>
                {plan.categoryIcon && <span style={{ marginRight: '6px' }}>{plan.categoryIcon}</span>}
                {plan.categoryName}
              </div>
            )}

            {/* Title */}
            <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 16px 0', lineHeight: '1.2' }}>
              {plan.title}
            </h1>

            {/* Price */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '24px' }}>
              {plan.showCreditsToClient && (
                <>
                  <span style={{ fontSize: '32px', fontWeight: '800', color: '#22c55e' }}>
                    {plan.offerPrice || plan.creditCost} <span style={{ fontSize: '16px', fontWeight: '500', color: '#64748b' }}>credits</span>
                  </span>
                  {plan.originalPrice && plan.originalPrice > (plan.offerPrice || plan.creditCost) && (
                    <span style={{ fontSize: '18px', fontWeight: '500', color: '#94a3b8', textDecoration: 'line-through' }}>
                      {plan.originalPrice}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Quantity */}
            {plan.showQuantityToClient && plan.quantity !== undefined && (
              <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '12px', marginBottom: '24px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Quantity:</span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{plan.quantity}</span>
              </div>
            )}

            {/* Description */}
            {plan.description && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '12px' }}>Description</h3>
                <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                  {plan.description}
                </p>
              </div>
            )}

            {/* Public Notes */}
            {plan.publicNotes && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '12px' }}>Additional Details</h3>
                <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                  {plan.publicNotes}
                </p>
              </div>
            )}

            {/* Allowed Clients Info (Admin Only) */}
            {plan.visibility === 'SELECTED' && plan.allowedClients.length > 0 && (
              <div style={{ marginTop: '32px', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '12px' }}>Allowed Clients (Admin View)</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {plan.allowedClients.map(client => (
                    <span key={client.id} style={{ padding: '6px 12px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', fontSize: '13px', fontWeight: '500', color: '#475569' }}>
                      {client.name || client.identifier}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Purchase Button (Demo) */}
            <button
              disabled
              style={{ width: '100%', padding: '16px', backgroundColor: '#e2e8f0', color: '#94a3b8', fontSize: '16px', fontWeight: '700', borderRadius: '12px', border: 'none', cursor: 'not-allowed', marginTop: '24px' }}
            >
              Purchase Plan (Client Action)
            </button>
          </div>
        </div>

        {/* Media Gallery */}
        {mediaArray.length > 1 && (
          <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {mediaArray.map((media, idx) => (
              <div key={idx} style={{ position: 'relative', paddingBottom: '100%', backgroundColor: '#f1f5f9', borderRadius: '12px', overflow: 'hidden' }}>
                {media.type === 'video' ? (
                  <video
                    src={media.url}
                    controls
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <img
                    src={media.url}
                    alt={`Media ${idx + 1}`}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanPreview;
