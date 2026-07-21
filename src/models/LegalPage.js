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
<p><strong>Go Viral Ads</strong> (goviralads.com)</p>
<p>Last updated: ${new Date().toLocaleDateString()}</p>

<h3>1. Introduction</h3>
<p>This Privacy Policy explains how Go Viral Ads ("we", "our", or "us") collects, uses, and protects your personal information when you use our website and services at goviralads.com.</p>

<h3>2. Information We Collect</h3>
<p>We collect the following types of information:</p>
<ul>
<li><strong>Account Information:</strong> Name, email address, and password when you create an account.</li>
<li><strong>Transaction Information:</strong> Payment details and transaction history when you purchase plans or recharge your wallet.</li>
<li><strong>Usage Data:</strong> Information about how you interact with our platform, including pages visited and actions taken.</li>
<li><strong>Communication Data:</strong> Any messages, support tickets, or inquiries you send through our platform.</li>
</ul>

<h3>3. How We Use Your Information</h3>
<p>We use your information to:</p>
<ul>
<li>Provide and maintain our advertising platform services</li>
<li>Process transactions and manage your wallet balance</li>
<li>Send important notifications about your account and orders</li>
<li>Respond to your support requests and inquiries</li>
<li>Improve our platform and user experience</li>
</ul>

<h3>4. Cookies and Tracking</h3>
<p>We use cookies and similar technologies to:</p>
<ul>
<li>Keep you logged in and maintain your session</li>
<li>Remember your preferences</li>
<li>Analyze how our platform is used</li>
</ul>
<p>You can control cookie settings through your browser. Note that disabling cookies may affect platform functionality.</p>

<h3>5. Third-Party Sharing</h3>
<p>We do not sell, trade, or rent your personal information. We may share information only with:</p>
<ul>
<li>Payment processors who handle transactions on our behalf</li>
<li>Service providers who assist in operating our platform</li>
<li>Legal authorities when required by law</li>
</ul>

<h3>6. Data Security</h3>
<p>We implement industry-standard security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. All transactions are processed through secure, encrypted connections.</p>

<h3>7. Data Retention</h3>
<p><strong>[CONFIRM REQUIRED: Specify how long user data is retained after account deletion. Example: "We retain account data for 30 days after deletion request, after which it is permanently removed."]</strong></p>

<h3>8. Your Rights</h3>
<p>You have the right to:</p>
<ul>
<li>Access your personal information that we hold</li>
<li>Request correction of inaccurate data</li>
<li>Request deletion of your account and data</li>
<li>Withdraw consent for data processing</li>
</ul>
<p>To exercise these rights, contact us at support@goviralads.com.</p>

<h3>9. Children's Privacy</h3>
<p>Our services are not intended for users under 18 years of age. We do not knowingly collect information from children.</p>

<h3>10. Changes to This Policy</h3>
<p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date. Continued use of our platform after changes constitutes acceptance.</p>

<h3>11. Contact Us</h3>
<p>For privacy-related questions or concerns:</p>
<p>Email: support@goviralads.com</p>
<p>Website: goviralads.com</p>`,
      metaDescription: 'Privacy Policy for Go Viral Ads - Learn how we collect, use, and protect your data.'
    },
    {
      slug: 'terms-of-service',
      title: 'Terms of Service',
      content: `<h2>Terms of Service</h2>
<p><strong>Go Viral Ads</strong> (goviralads.com)</p>
<p>Last updated: ${new Date().toLocaleDateString()}</p>

<h3>1. Acceptance of Terms</h3>
<p>By accessing or using Go Viral Ads (goviralads.com), you agree to be bound by these Terms of Service. If you do not agree to these terms, you must not use our services.</p>

<h3>2. Description of Service</h3>
<p>Go Viral Ads is an online platform that provides viral advertising and marketing services. Users can browse and purchase advertising plans, manage tasks, and track campaign performance through our web application.</p>

<h3>3. User Accounts</h3>
<p>To use our services, you must create an account. You agree to:</p>
<ul>
<li>Provide accurate and complete registration information</li>
<li>Maintain the security of your account credentials</li>
<li>Accept responsibility for all activities under your account</li>
<li>Notify us immediately of any unauthorized access</li>
</ul>
<p>You must be at least 18 years old to create an account.</p>

<h3>4. Plans and Subscriptions</h3>
<p>Our platform offers various advertising plans for purchase. By purchasing a plan, you agree to the specific terms associated with that plan.</p>
<p><strong>[CONFIRM REQUIRED: Describe subscription terms - auto-renewal policy, duration, what happens at expiry, cancellation process. The current codebase shows plan purchase creates a subscription, but the exact business rules for renewal/cancellation are not confirmed.]</strong></p>

<h3>5. Wallet and Credits</h3>
<p>Our platform uses a wallet system for managing funds. Users can request wallet recharge to add funds.</p>
<p><strong>[CONFIRM REQUIRED: Clarify the following based on actual business rules:]</strong></p>
<ul>
<li><strong>Credit-to-currency relationship:</strong> The platform displays values in Indian Rupees (Rs) but refers to them as "Credits". Confirm whether 1 Credit = Rs 1, or if there is a different conversion rate.</li>
<li><strong>Wallet balance expiry:</strong> Confirm whether wallet balances expire after a certain period, or if they remain valid indefinitely.</li>
<li><strong>Recharge process:</strong> The current implementation uses a "Request Recharge" model (manual admin approval). Confirm if this will change to automated instant recharge.</li>
</ul>

<h3>6. Payment Terms</h3>
<p>All payments are processed in Indian Rupees (INR). Prices displayed on the platform are inclusive of applicable taxes unless stated otherwise.</p>
<p><strong>[CONFIRM REQUIRED: Confirm GST applicability, whether prices include or exclude GST, and if invoices are provided to users.]</strong></p>

<h3>7. Prohibited Use</h3>
<p>You agree not to:</p>
<ul>
<li>Use the platform for any unlawful purpose</li>
<li>Create multiple accounts to abuse promotions or systems</li>
<li>Attempt to gain unauthorized access to our systems</li>
<li>Interfere with the platform's operation or other users' experience</li>
<li>Use automated tools or bots to interact with the platform</li>
</ul>

<h3>8. Intellectual Property</h3>
<p>All content, features, and functionality of Go Viral Ads are owned by us and protected by copyright, trademark, and other intellectual property laws.</p>

<h3>9. Limitation of Liability</h3>
<p>To the maximum extent permitted by law, Go Viral Ads shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service. Our total liability shall not exceed the amount you have paid to us in the 12 months preceding the claim.</p>

<h3>10. Termination</h3>
<p>We may suspend or terminate your account if:</p>
<ul>
<li>You violate these Terms of Service</li>
<li>Required by law or regulatory obligation</li>
<li>Your account has been inactive for an extended period</li>
</ul>
<p>Upon termination, any remaining wallet balance will be handled as per our Refund Policy.</p>

<h3>11. Governing Law and Jurisdiction</h3>
<p><strong>[CONFIRM: Specify the governing law and jurisdiction for disputes. Example: "These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Mumbai, Maharashtra."]</strong></p>

<h3>12. Changes to Terms</h3>
<p>We reserve the right to modify these Terms at any time. We will notify users of significant changes via email or platform notification. Your continued use of the service after changes constitutes acceptance.</p>

<h3>13. Contact</h3>
<p>For questions about these Terms:</p>
<p>Email: support@goviralads.com</p>
<p>Website: goviralads.com</p>`,
      metaDescription: 'Terms of Service for Go Viral Ads - Read our terms and conditions for using the platform.'
    },
    {
      slug: 'refund-policy',
      title: 'Refund Policy',
      content: `<h2>Refund Policy</h2>
<p><strong>Go Viral Ads</strong> (goviralads.com)</p>
<p>Last updated: ${new Date().toLocaleDateString()}</p>

<h3>1. General Policy</h3>
<p>At Go Viral Ads, we want you to be satisfied with our services. This policy outlines when and how refunds are processed.</p>

<h3>2. Wallet Recharge</h3>
<p><strong>[CONFIRM REQUIRED: State clearly whether wallet recharge amounts are refundable or non-refundable once added. Example: "Wallet recharge amounts are non-refundable once credited to your wallet balance."]</strong></p>

<h3>3. Plan Purchases and Subscriptions</h3>
<p><strong>[CONFIRM REQUIRED: State the refund policy for plan/subscription purchases. Consider:]</strong></p>
<ul>
<li>Is there a cooling-off period after purchase?</li>
<li>Can a plan be cancelled before completion?</li>
<li>What happens if the advertised service cannot be delivered?</li>
</ul>

<h3>4. Service Issues</h3>
<p>If you experience issues with a service that was not delivered as described, you may request a review within <strong>[CONFIRM REQUIRED: number of days]</strong> of the issue.</p>

<h3>5. Refund Eligibility</h3>
<p>Refunds may be issued at our discretion for:</p>
<ul>
<li>Services not delivered as described in the plan</li>
<li>Technical issues on our platform preventing service delivery</li>
<li>Duplicate or erroneous charges</li>
</ul>

<h3>6. Refund Process</h3>
<p>To request a refund:</p>
<ol>
<li>Contact our support team at support@goviralads.com</li>
<li>Provide your account details and description of the issue</li>
<li>Our team will review your request within <strong>[CONFIRM REQUIRED: number of business days for review]</strong></li>
<li>If approved, the refund will be processed to your original payment method or wallet balance</li>
</ol>
<p><strong>[CONFIRM REQUIRED: Clarify whether refunds go back to original payment method, wallet balance, or both. The current codebase shows wallet transactions with REFUND type, suggesting refunds go to wallet.]</strong></p>

<h3>7. Non-Refundable Items</h3>
<p>The following are generally not eligible for refunds:</p>
<ul>
<li>Services that have been fully completed and approved</li>
<li>Funds already spent from wallet on completed tasks</li>
</ul>

<h3>8. Processing Time</h3>
<p><strong>[CONFIRM REQUIRED: State the expected timeline for refund processing after approval. Example: "Approved refunds are processed within 5-7 business days."]</strong></p>

<h3>9. Contact</h3>
<p>For refund inquiries:</p>
<p>Email: support@goviralads.com</p>
<p>Website: goviralads.com</p>`,
      metaDescription: 'Refund Policy for Go Viral Ads - Learn about our refund and cancellation policies.'
    },
    {
      slug: 'contact-us',
      title: 'Contact Us',
      content: `<h2>Contact Us</h2>
<p><strong>Go Viral Ads</strong> (goviralads.com)</p>

<h3>Get in Touch</h3>
<p>We are here to help. If you have any questions, concerns, or feedback, please reach out to us using the information below.</p>

<h3>Customer Support</h3>
<p>For technical support, account issues, or service-related inquiries:</p>
<p>Email: support@goviralads.com</p>

<h3>Business Inquiries</h3>
<p>For partnerships, collaborations, or business opportunities:</p>
<p>Email: business@goviralads.com</p>

<h3>Registered Office</h3>
<p><strong>[CONFIRM: Registered Business Address]</strong></p>
<p><strong>[CONFIRM: City, State, PIN Code]</strong></p>
<p><strong>[CONFIRM: Country]</strong></p>

<h3>Phone</h3>
<p><strong>[CONFIRM: Contact Phone Number]</strong></p>

<h3>Business Hours</h3>
<p>Monday - Friday: 10:00 AM - 7:00 PM (IST)</p>
<p>Saturday: 10:00 AM - 2:00 PM (IST)</p>
<p>Sunday: Closed</p>

<h3>Response Time</h3>
<p>We aim to respond to all inquiries within 24-48 business hours.</p>

<h3>Support Through Platform</h3>
<p>Logged-in users can also raise support tickets directly through the Go Viral Ads platform for faster resolution.</p>`,
      metaDescription: 'Contact Go Viral Ads - Get in touch with our support team for help and inquiries.'
    },
    {
      slug: 'about',
      title: 'About Us',
      content: `<h2>About Go Viral Ads</h2>

<h3>Who We Are</h3>
<p>Go Viral Ads is an online advertising and marketing platform based in India. We connect businesses with effective viral advertising solutions to help them grow their reach and engage their target audience.</p>

<h3>What We Do</h3>
<p>We provide a comprehensive platform where users can:</p>
<ul>
<li>Browse and purchase advertising plans tailored to different business needs</li>
<li>Track campaign tasks and monitor progress in real time</li>
<li>Manage their account balance and transactions through our wallet system</li>
<li>Access support and raise tickets for any service-related queries</li>
</ul>

<h3>Our Mission</h3>
<p>To make viral advertising accessible, transparent, and effective for businesses of all sizes. We believe every business deserves powerful marketing tools without complexity.</p>

<h3>Our Values</h3>
<ul>
<li><strong>Transparency:</strong> Clear pricing, honest communication, and no hidden charges.</li>
<li><strong>Reliability:</strong> We deliver on our promises and stand behind our services.</li>
<li><strong>Innovation:</strong> We continuously improve our platform to meet the evolving needs of digital marketing.</li>
<li><strong>Customer Focus:</strong> Your success is our priority. We are committed to providing excellent service and support.</li>
</ul>

<h3>Platform Features</h3>
<ul>
<li>Wide range of advertising plans across multiple categories</li>
<li>Real-time task tracking and progress monitoring</li>
<li>Secure wallet system for managing funds</li>
<li>Dedicated support ticket system</li>
<li>Admin-managed quality assurance for all services</li>
</ul>

<h3><strong>[CONFIRM REQUIRED: Add founding year, team size, or any specific company milestones if available.]</strong></h3>

<h3>Get Started</h3>
<p>Join Go Viral Ads today and take your business marketing to the next level.</p>
<p>Website: goviralads.com</p>`,
      metaDescription: 'About Go Viral Ads - Learn about our viral advertising platform, mission, and services.'
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
