const express = require('express');
const Subscription = require('../models/Subscription');
const { Task } = require('../models/Task');
const { authenticateJWT } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorization');

const router = express.Router();

router.use(authenticateJWT);
router.use(requireAdmin);

// CREATE SUBSCRIPTION
router.post('/', async (req, res) => {
  try {
    const { title, description, tasks, totalPrice, offerPrice, durationDays, featureImage, targetClients } = req.body;

    console.log('=== ADMIN CREATE SUBSCRIPTION ===');
    console.log('Title:', title);
    console.log('Tasks count:', tasks?.length || 0);

    if (!title || !tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'Title and tasks array required' });
    }

    if (totalPrice === undefined || totalPrice === null) {
      return res.status(400).json({ error: 'Total price required' });
    }

    // Validate tasks exist
    const taskDocs = await Task.find({ _id: { $in: tasks } }).exec();
    if (taskDocs.length !== tasks.length) {
      return res.status(400).json({ error: 'One or more tasks not found' });
    }

    const subscription = await Subscription.create({
      title: title.trim(),
      description: description?.trim() || '',
      tasks,
      totalPrice,
      offerPrice: offerPrice || undefined,
      durationDays: durationDays || undefined,
      featureImage: featureImage?.trim() || undefined,
      targetClients: targetClients || null,
      isActive: true,
    });

    console.log('Subscription created:', subscription._id.toString());

    return res.status(201).json({
      subscription: {
        id: subscription._id.toString(),
        title: subscription.title,
        description: subscription.description,
        tasks: subscription.tasks,
        totalPrice: subscription.totalPrice,
        offerPrice: subscription.offerPrice,
        durationDays: subscription.durationDays,
        featureImage: subscription.featureImage,
        isActive: subscription.isActive,
        targetClients: subscription.targetClients,
        createdAt: subscription.createdAt,
      },
    });
  } catch (err) {
    console.error('Create subscription error:', err);
    return res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// GET ALL SUBSCRIPTIONS
router.get('/', async (req, res) => {
  try {
    const subscriptions = await Subscription.find()
      .populate('tasks', 'title creditCost')
      .sort({ createdAt: -1 })
      .exec();

    console.log('=== ADMIN FETCH SUBSCRIPTIONS ===');
    console.log('Count:', subscriptions.length);

    return res.status(200).json({
      subscriptions: subscriptions.map(s => ({
        id: s._id.toString(),
        title: s.title,
        description: s.description,
        tasks: s.tasks.map(t => ({
          id: t._id.toString(),
          title: t.title,
          creditCost: t.creditCost,
        })),
        totalPrice: s.totalPrice,
        offerPrice: s.offerPrice,
        durationDays: s.durationDays,
        featureImage: s.featureImage,
        isActive: s.isActive,
        targetClients: s.targetClients,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    });
  } catch (err) {
    console.error('Fetch subscriptions error:', err);
    return res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// UPDATE SUBSCRIPTION
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, tasks, totalPrice, offerPrice, durationDays, featureImage, targetClients, isActive } = req.body;

    console.log('=== ADMIN UPDATE SUBSCRIPTION ===');
    console.log('ID:', id);

    const subscription = await Subscription.findById(id).exec();

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Update fields
    if (title !== undefined) subscription.title = title.trim();
    if (description !== undefined) subscription.description = description.trim();
    if (tasks !== undefined) {
      if (!Array.isArray(tasks) || tasks.length === 0) {
        return res.status(400).json({ error: 'Tasks must be a non-empty array' });
      }
      subscription.tasks = tasks;
    }
    if (totalPrice !== undefined) subscription.totalPrice = totalPrice;
    if (offerPrice !== undefined) subscription.offerPrice = offerPrice || undefined;
    if (durationDays !== undefined) subscription.durationDays = durationDays || undefined;
    if (featureImage !== undefined) subscription.featureImage = featureImage?.trim() || undefined;
    if (targetClients !== undefined) subscription.targetClients = targetClients || null;
    if (isActive !== undefined) subscription.isActive = isActive;

    await subscription.save();

    console.log('Subscription updated:', subscription._id.toString());

    return res.status(200).json({
      subscription: {
        id: subscription._id.toString(),
        title: subscription.title,
        description: subscription.description,
        tasks: subscription.tasks,
        totalPrice: subscription.totalPrice,
        offerPrice: subscription.offerPrice,
        durationDays: subscription.durationDays,
        featureImage: subscription.featureImage,
        isActive: subscription.isActive,
        targetClients: subscription.targetClients,
        updatedAt: subscription.updatedAt,
      },
    });
  } catch (err) {
    console.error('Update subscription error:', err);
    return res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// DELETE SUBSCRIPTION
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('=== ADMIN DELETE SUBSCRIPTION ===');
    console.log('ID:', id);

    const subscription = await Subscription.findByIdAndDelete(id).exec();

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    console.log('Subscription deleted:', id);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Delete subscription error:', err);
    return res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

module.exports = router;
