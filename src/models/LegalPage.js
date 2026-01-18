const mongoose = require('mongoose');

const legalPageSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    enum: ['privacy-policy', 'terms-of-service', 'refund-policy', 'contact-us', 'about']
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true,
    default: ''
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  metaDescription: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Index for faster lookups
legalPageSchema.index({ slug: 1 });

// Static method to get or create default pages
legalPageSchema.statics.ensureDefaults = async function() {
  const defaults = [
    {
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      content: `<h2>Privacy Policy</h2>
<p>Last updated: ${new Date().toLocaleDateString()}</p>

<h3>1. Information We Collect</h3>
<p>We collect information you provide directly to us, such as when you create an account, make a purchase, or contact us for support.</p>

<h3>2. How We Use Your Information</h3>
<p>We use the information we collect to provide, maintain, and improve our services, process transactions, and communicate with you.</p>

<h3>3. Information Sharing</h3>
<p>We do not sell, trade, or rent your personal information to third parties. We may share information with service providers who assist us in operating our platform.</p>

<h3>4. Data Security</h3>
<p>We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>

<h3>5. Your Rights</h3>
<p>You have the right to access, update, or delete your personal information. Contact us at the email below to exercise these rights.</p>

<h3>6. Cookies</h3>
<p>We use cookies and similar technologies to enhance your experience on our platform.</p>

<h3>7. Contact Us</h3>
<p>If you have questions about this Privacy Policy, please contact us.</p>`,
      metaDescription: 'Privacy Policy for TaskFlow Pro - Learn how we collect, use, and protect your data.'
    },
    {
      slug: 'terms-of-service',
      title: 'Terms of Service',
      content: `<h2>Terms of Service</h2>
<p>Last updated: ${new Date().toLocaleDateString()}</p>

<h3>1. Acceptance of Terms</h3>
<p>By accessing or using TaskFlow Pro, you agree to be bound by these Terms of Service and all applicable laws and regulations.</p>

<h3>2. Use of Service</h3>
<p>You agree to use our service only for lawful purposes and in accordance with these Terms. You are responsible for maintaining the confidentiality of your account.</p>

<h3>3. User Accounts</h3>
<p>You must provide accurate and complete information when creating an account. You are responsible for all activities under your account.</p>

<h3>4. Payment Terms</h3>
<p>Certain features require payment. All payments are processed securely. Prices are subject to change with notice.</p>

<h3>5. Intellectual Property</h3>
<p>All content, features, and functionality of TaskFlow Pro are owned by us and are protected by copyright, trademark, and other laws.</p>

<h3>6. Limitation of Liability</h3>
<p>We shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the service.</p>

<h3>7. Termination</h3>
<p>We may terminate or suspend your account at our sole discretion, without prior notice, for conduct that we believe violates these Terms.</p>

<h3>8. Changes to Terms</h3>
<p>We reserve the right to modify these Terms at any time. Your continued use of the service constitutes acceptance of the modified Terms.</p>`,
      metaDescription: 'Terms of Service for TaskFlow Pro - Read our terms and conditions for using the platform.'
    },
    {
      slug: 'refund-policy',
      title: 'Refund Policy',
      content: `<h2>Refund Policy</h2>
<p>Last updated: ${new Date().toLocaleDateString()}</p>

<h3>1. Credit Refunds</h3>
<p>Credits purchased on TaskFlow Pro are generally non-refundable once added to your wallet balance.</p>

<h3>2. Service Issues</h3>
<p>If you experience issues with a service or task that was not delivered as described, you may request a review within 7 days of completion.</p>

<h3>3. Refund Process</h3>
<p>To request a refund, contact our support team with your order details. We will review your request within 5 business days.</p>

<h3>4. Eligibility</h3>
<p>Refunds may be issued at our discretion for:
<ul>
<li>Services not delivered as described</li>
<li>Technical issues preventing service delivery</li>
<li>Duplicate charges</li>
</ul>
</p>

<h3>5. Non-Refundable Items</h3>
<p>The following are not eligible for refunds:
<ul>
<li>Completed and approved services</li>
<li>Credits used for completed tasks</li>
<li>Services cancelled by the user after work has begun</li>
</ul>
</p>

<h3>6. Contact</h3>
<p>For refund inquiries, please contact our support team.</p>`,
      metaDescription: 'Refund Policy for TaskFlow Pro - Learn about our refund and cancellation policies.'
    },
    {
      slug: 'contact-us',
      title: 'Contact Us',
      content: `<h2>Contact Us</h2>

<h3>Get in Touch</h3>
<p>We're here to help! If you have any questions, concerns, or feedback, please reach out to us.</p>

<h3>Support</h3>
<p>For technical support or service-related inquiries:</p>
<p>Email: support@taskflowpro.com</p>

<h3>Business Inquiries</h3>
<p>For business partnerships or collaborations:</p>
<p>Email: business@taskflowpro.com</p>

<h3>Office Address</h3>
<p>[Your Business Address]</p>
<p>[City, State, ZIP]</p>
<p>[Country]</p>

<h3>Business Hours</h3>
<p>Monday - Friday: 9:00 AM - 6:00 PM</p>
<p>Saturday - Sunday: Closed</p>

<h3>Response Time</h3>
<p>We aim to respond to all inquiries within 24-48 business hours.</p>`,
      metaDescription: 'Contact TaskFlow Pro - Get in touch with our support team for help and inquiries.'
    },
    {
      slug: 'about',
      title: 'About Us',
      content: `<h2>About TaskFlow Pro</h2>

<h3>Our Mission</h3>
<p>TaskFlow Pro is dedicated to simplifying task management and connecting businesses with efficient service solutions.</p>

<h3>What We Do</h3>
<p>We provide a comprehensive platform for managing tasks, projects, and services. Our goal is to streamline workflows and enhance productivity for businesses of all sizes.</p>

<h3>Our Values</h3>
<ul>
<li><strong>Quality:</strong> We are committed to delivering excellent service and user experience.</li>
<li><strong>Transparency:</strong> Clear communication and honest practices guide everything we do.</li>
<li><strong>Innovation:</strong> We continuously improve our platform to meet evolving needs.</li>
<li><strong>Customer Focus:</strong> Your success is our priority.</li>
</ul>

<h3>Why Choose Us</h3>
<p>TaskFlow Pro offers a secure, reliable, and user-friendly platform for managing your business needs. With features designed for efficiency and ease of use, we help you focus on what matters most - growing your business.</p>

<h3>Join Us</h3>
<p>Experience the difference with TaskFlow Pro. Sign up today and take control of your tasks.</p>`,
      metaDescription: 'About TaskFlow Pro - Learn about our mission, values, and what makes us different.'
    }
  ];

  for (const page of defaults) {
    await this.findOneAndUpdate(
      { slug: page.slug },
      { $setOnInsert: page },
      { upsert: true, new: true }
    );
  }
};

module.exports = mongoose.model('LegalPage', legalPageSchema);
