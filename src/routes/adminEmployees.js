const express = require('express');
const User = require('../models/User');
const { Employee, EMPLOYEE_STATUS, EMPLOYEE_ROLES } = require('../models/Employee');
const { ClientEmployeeAssignment, ASSIGNMENT_STATUS } = require('../models/ClientEmployeeAssignment');
const { ROLES } = require('../config');
const { authenticateJWT } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorization');

const router = express.Router();

router.use(authenticateJWT);
router.use(requireAdmin);

function normalizeCommissionSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return undefined;
  }

  const normalized = {};
  if (settings.enabled !== undefined) normalized.enabled = !!settings.enabled;
  if (settings.percentage !== undefined) normalized.percentage = Number(settings.percentage);
  if (settings.notes !== undefined) normalized.notes = String(settings.notes || '').trim();
  return normalized;
}

function serializeEmployee(employee) {
  return {
    id: employee._id.toString(),
    name: employee.name,
    identifier: employee.identifier,
    phone: employee.phone || '',
    defaultRole: employee.defaultRole,
    status: employee.status,
    commissionSettings: employee.commissionSettings || { enabled: false, percentage: 0, notes: '' },
    userId: employee.userId ? employee.userId.toString() : null,
    notes: employee.notes || '',
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

function serializeAssignment(assignment) {
  const employee = assignment.employeeId;
  // COMMISSION SOURCE OF TRUTH: Employee model (not assignment)
  const employeeCommission = employee?.commissionSettings || { enabled: false, percentage: 0, notes: '' };
  return {
    id: assignment._id.toString(),
    clientId: assignment.clientId.toString(),
    employee: employee && employee._id ? serializeEmployee(employee) : { id: assignment.employeeId.toString() },
    // Role from Employee.defaultRole (single source of truth)
    role: employee?.defaultRole || assignment.role,
    status: assignment.status,
    // Commission from Employee.commissionSettings (single source of truth)
    commissionSettings: employeeCommission,
    assignedBy: assignment.assignedBy ? assignment.assignedBy.toString() : null,
    assignedAt: assignment.assignedAt,
    removedBy: assignment.removedBy ? assignment.removedBy.toString() : null,
    removedAt: assignment.removedAt,
    notes: assignment.notes || '',
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}

router.get('/roles', (_req, res) => {
  return res.status(200).json({
    roles: Object.entries(EMPLOYEE_ROLES).map(([key, value]) => ({
      key,
      value,
    })),
  });
});

// GET /available-users - Get Users not linked to any Employee
// MUST be before /:employeeId to avoid route matching conflict
router.get('/available-users', async (req, res) => {
  try {
    // Get all Users (any role)
    const allUsers = await User.find({
      isDeleted: { $ne: true },
    }).select('_id identifier profile.name profile.company status role').exec();

    // Get all Employees with linked Users
    const linkedUserIds = await Employee.find({
      userId: { $exists: true, $ne: null },
      isDeleted: { $ne: true },
    }).select('userId').exec();

    const linkedUserIdSet = new Set(linkedUserIds.map(e => e.userId?.toString()).filter(Boolean));

    // Filter out already-linked Users
    const availableUsers = allUsers
      .filter(u => !linkedUserIdSet.has(u._id.toString()))
      .map(u => ({
        id: u._id.toString(),
        identifier: u.identifier,
        name: u.profile?.name || '',
        company: u.profile?.company || '',
        status: u.status,
        role: u.role,
      }));

    return res.status(200).json({ users: availableUsers });
  } catch (err) {
    console.error('[AVAILABLE USERS] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch available users' });
  }
});

// GET /:employeeId - Get single employee detail
router.get('/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findOne({ _id: employeeId, isDeleted: { $ne: true } }).exec();
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    return res.status(200).json({ employee: serializeEmployee(employee) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve employee' });
  }
});

// GET /:employeeId/assignments - Get clients assigned to this employee
router.get('/:employeeId/assignments', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findOne({ _id: employeeId, isDeleted: { $ne: true } }).exec();
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const assignments = await ClientEmployeeAssignment.find({
      employeeId,
      status: ASSIGNMENT_STATUS.ACTIVE,
    })
      .populate('clientId', 'identifier name profile')
      .sort({ createdAt: -1 })
      .exec();

    return res.status(200).json({
      employee: serializeEmployee(employee),
      assignments: assignments.map(a => ({
        id: a._id.toString(),
        clientId: a.clientId?._id?.toString() || a.clientId?.toString(),
        clientName: a.clientId?.profile?.name || a.clientId?.name || a.clientId?.identifier || 'Unknown',
        clientIdentifier: a.clientId?.identifier || '',
        role: a.role,
        status: a.status,
        assignedAt: a.assignedAt,
        notes: a.notes || '',
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve employee assignments' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { status, role, search } = req.query;
    const filter = { isDeleted: { $ne: true } };

    if (status) filter.status = status;
    if (role) filter.defaultRole = role;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { identifier: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const employees = await Employee.find(filter).sort({ name: 1 }).exec();
    return res.status(200).json({ employees: employees.map(serializeEmployee) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve employees' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, identifier, phone, defaultRole, commissionSettings, notes } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Employee name is required' });
    }
    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ error: 'Employee identifier is required' });
    }
    if (defaultRole && !Object.values(EMPLOYEE_ROLES).includes(defaultRole)) {
      return res.status(400).json({ error: 'Invalid employee role' });
    }

    const existing = await Employee.findOne({
      identifier: identifier.trim().toLowerCase(),
    }).exec();

    if (existing) {
      return res.status(400).json({ error: 'Employee with this identifier already exists' });
    }

    const employee = await Employee.create({
      name: name.trim(),
      identifier: identifier.trim().toLowerCase(),
      phone: phone ? phone.trim() : '',
      defaultRole: defaultRole || EMPLOYEE_ROLES.OTHER,
      commissionSettings: normalizeCommissionSettings(commissionSettings),
      notes: notes ? notes.trim() : '',
      createdBy: req.user.id,
    });

    return res.status(201).json({ employee: serializeEmployee(employee) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create employee' });
  }
});

router.patch('/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { name, phone, defaultRole, status, commissionSettings, notes, userId } = req.body || {};

    const employee = await Employee.findOne({ _id: employeeId, isDeleted: { $ne: true } }).exec();
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (defaultRole !== undefined && !Object.values(EMPLOYEE_ROLES).includes(defaultRole)) {
      return res.status(400).json({ error: 'Invalid employee role' });
    }
    if (status !== undefined && !Object.values(EMPLOYEE_STATUS).includes(status)) {
      return res.status(400).json({ error: 'Invalid employee status' });
    }

    // Validate userId if provided
    if (userId !== undefined && userId !== null && userId !== '') {
      const user = await User.findById(userId).exec();
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if User is already linked to another Employee
      const existingLink = await Employee.findOne({
        userId: userId,
        _id: { $ne: employeeId },
        isDeleted: { $ne: true },
      }).exec();

      if (existingLink) {
        return res.status(400).json({
          error: 'This User is already linked to another Employee',
          linkedTo: {
            id: existingLink._id.toString(),
            name: existingLink.name,
            identifier: existingLink.identifier,
          },
        });
      }
    }

    if (name !== undefined) employee.name = name.trim();
    if (phone !== undefined) employee.phone = phone ? phone.trim() : '';
    if (defaultRole !== undefined) employee.defaultRole = defaultRole;
    if (status !== undefined) employee.status = status;
    if (commissionSettings !== undefined) employee.commissionSettings = normalizeCommissionSettings(commissionSettings);
    if (notes !== undefined) employee.notes = notes ? notes.trim() : '';
    if (userId !== undefined) employee.userId = userId || null;

    await employee.save();
    return res.status(200).json({ employee: serializeEmployee(employee) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update employee' });
  }
});

router.delete('/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;

    const employee = await Employee.findOne({ _id: employeeId, isDeleted: { $ne: true } }).exec();
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    employee.isDeleted = true;
    employee.deletedAt = new Date();
    employee.status = EMPLOYEE_STATUS.INACTIVE;
    await employee.save();

    await ClientEmployeeAssignment.updateMany(
      { employeeId, status: ASSIGNMENT_STATUS.ACTIVE },
      { status: ASSIGNMENT_STATUS.REMOVED, removedBy: req.user.id, removedAt: new Date() }
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete employee' });
  }
});

router.get('/clients/:clientId/assignments', async (req, res) => {
  try {
    const { clientId } = req.params;

    const client = await User.findById(clientId).exec();
    if (!client || client.role !== ROLES.CLIENT || client.isDeleted) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const assignments = await ClientEmployeeAssignment.find({
      clientId,
      status: ASSIGNMENT_STATUS.ACTIVE,
    })
      .populate('employeeId')
      .sort({ createdAt: -1 })
      .exec();

    return res.status(200).json({
      client: {
        id: client._id.toString(),
        identifier: client.identifier,
      },
      assignments: assignments.map(serializeAssignment),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve client employee assignments' });
  }
});

router.post('/clients/:clientId/assignments', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { employeeId, notes } = req.body || {};

    const client = await User.findById(clientId).exec();
    if (!client || client.role !== ROLES.CLIENT || client.isDeleted) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const employee = await Employee.findOne({
      _id: employeeId,
      status: EMPLOYEE_STATUS.ACTIVE,
      isDeleted: { $ne: true },
    }).exec();
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Use Employee's defaultRole - no separate role configuration needed
    const assignmentRole = employee.defaultRole;

    // Create assignment - commission comes from Employee model (single source of truth)
    const assignment = await ClientEmployeeAssignment.create({
      clientId,
      employeeId,
      role: assignmentRole, // Stored for backward compatibility, but role is read from Employee
      notes: notes ? notes.trim() : '',
      assignedBy: req.user.id,
    });

    await assignment.populate('employeeId');
    return res.status(201).json({ assignment: serializeAssignment(assignment) });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(400).json({ error: 'Employee is already assigned to this client' });
    }
    return res.status(500).json({ error: 'Failed to assign employee to client' });
  }
});

router.patch('/clients/:clientId/assignments/:assignmentId', async (req, res) => {
  try {
    const { clientId, assignmentId } = req.params;
    const { notes } = req.body || {};

    const assignment = await ClientEmployeeAssignment.findOne({
      _id: assignmentId,
      clientId,
      status: ASSIGNMENT_STATUS.ACTIVE,
    }).exec();

    if (!assignment) {
      return res.status(404).json({ error: 'Employee assignment not found' });
    }

    // Only notes can be updated on the assignment
    // Role and commission come from Employee model (single source of truth)
    if (notes !== undefined) {
      assignment.notes = notes ? notes.trim() : '';
    }

    await assignment.save();
    await assignment.populate('employeeId');
    return res.status(200).json({ assignment: serializeAssignment(assignment) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update employee assignment' });
  }
});

router.delete('/clients/:clientId/assignments/:assignmentId', async (req, res) => {
  try {
    const { clientId, assignmentId } = req.params;

    const assignment = await ClientEmployeeAssignment.findOne({
      _id: assignmentId,
      clientId,
      status: ASSIGNMENT_STATUS.ACTIVE,
    }).exec();

    if (!assignment) {
      return res.status(404).json({ error: 'Employee assignment not found' });
    }

    assignment.status = ASSIGNMENT_STATUS.REMOVED;
    assignment.removedBy = req.user.id;
    assignment.removedAt = new Date();
    await assignment.save();

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove employee assignment' });
  }
});

module.exports = router;
