const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected Successfully'))
.catch(err => console.log('❌ MongoDB Connection Error:', err));

// ============= SCHEMAS =============

// Contact Schema
const contactSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    service: String,
    message: String,
    date: { type: Date, default: Date.now },
    status: { type: String, default: 'new' } // new, contacted, completed
});

// Client Schema (Portfolio के लिए)
const clientSchema = new mongoose.Schema({
    name: String,
    logo: String,
    projectName: String,
    category: String,
    results: String,
    testimonial: String,
    clientRating: Number,
    date: { type: Date, default: Date.now }
});

// Admin Schema
const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

// Models
const Contact = mongoose.model('Contact', contactSchema);
const Client = mongoose.model('Client', clientSchema);
const Admin = mongoose.model('Admin', adminSchema);

// ============= MIDDLEWARE =============

// Auth Middleware
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) throw new Error();
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const admin = await Admin.findById(decoded.id);
        if (!admin) throw new Error();
        
        req.admin = admin;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Please authenticate' });
    }
};

// ============= API ROUTES =============

// ----------------- CONTACT FORM -----------------
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, service, message } = req.body;
        
        // Validation
        if (!name || !email || !message) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name, email and message are required' 
            });
        }
        
        // Save to database
        const contact = new Contact({ name, email, phone, service, message });
        await contact.save();
        
        // Send email notification (optional)
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });
            
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: process.env.EMAIL_USER,
                subject: 'New Contact Form Submission',
                html: `
                    <h2>New Lead from SMMA Website</h2>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
                    <p><strong>Service:</strong> ${service || 'Not specified'}</p>
                    <p><strong>Message:</strong> ${message}</p>
                `
            });
        } catch (emailError) {
            console.log('Email notification failed:', emailError);
        }
        
        res.status(201).json({ 
            success: true, 
            message: 'Thank you! We will contact you soon.' 
        });
        
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error. Please try again.' 
        });
    }
});

// ----------------- GET ALL CONTACTS (Admin only) -----------------
app.get('/api/contacts', auth, async (req, res) => {
    try {
        const contacts = await Contact.find().sort({ date: -1 });
        res.json({ success: true, data: contacts });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ----------------- UPDATE CONTACT STATUS (Admin only) -----------------
app.put('/api/contact/:id', auth, async (req, res) => {
    try {
        const { status } = req.body;
        const contact = await Contact.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );
        res.json({ success: true, data: contact });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ----------------- DELETE CONTACT (Admin only) -----------------
app.delete('/api/contact/:id', auth, async (req, res) => {
    try {
        await Contact.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Contact deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ----------------- PORTFOLIO/CLIENTS ROUTES -----------------
app.get('/api/clients', async (req, res) => {
    try {
        const clients = await Client.find().sort({ date: -1 });
        res.json({ success: true, data: clients });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/clients', auth, async (req, res) => {
    try {
        const client = new Client(req.body);
        await client.save();
        res.status(201).json({ success: true, data: client });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ----------------- ADMIN AUTH -----------------
app.post('/api/admin/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Check if admin exists
        const existingAdmin = await Admin.findOne({ username });
        if (existingAdmin) {
            return res.status(400).json({ success: false, message: 'Admin already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create admin
        const admin = new Admin({ username, password: hashedPassword });
        await admin.save();
        
        res.status(201).json({ success: true, message: 'Admin created successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Find admin
        const admin = await Admin.findOne({ username });
        if (!admin) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        // Check password
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        // Create token
        const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ success: true, token, message: 'Login successful' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============= SERVE FRONTEND =============
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============= START SERVER =============
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📁 Frontend: http://localhost:${PORT}`);
    console.log(`📝 API: http://localhost:${PORT}/api`);
});