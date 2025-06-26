// Import Required Packages
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

// Load environment variables
dotenv.config();

// Initialize Express App
const app = express();
app.use(cors());
app.use(express.json());

// ----------------------
// 1. Connect to MongoDB
// ----------------------
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// ----------------------
// 2. Define Mongoose Schemas
// ----------------------

// User Schema (Super Admin or Campus Admin)
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ['super-admin', 'campus-admin'], default: 'campus-admin' },
  campus: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus', default: null }
});
const User = mongoose.model('User', userSchema);

// Campus Schema
const campusSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: String
});
const Campus = mongoose.model('Campus', campusSchema);

// Teaching Schema
const teachingSchema = new mongoose.Schema({
  title: String,
  description: String,
  videoUrl: String,
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  campus: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus', default: null },
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  comments: [{ name: String, comment: String, date: { type: Date, default: Date.now } }]
});
const Teaching = mongoose.model('Teaching', teachingSchema);

// Testimony Schema
const testimonySchema = new mongoose.Schema({
  name: String,
  message: String,
  approved: { type: Boolean, default: false }
});
const Testimony = mongoose.model('Testimony', testimonySchema);

// Prayer Request Schema
const prayerSchema = new mongoose.Schema({
  name: String,
  request: String,
  date: { type: Date, default: Date.now }
});
const PrayerRequest = mongoose.model('PrayerRequest', prayerSchema);

// ----------------------
// 3. Middleware: Auth + Role
// ----------------------

// Verify Token Middleware
const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).json({ message: 'No token, access denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// ----------------------
// 4. Routes
// ----------------------

// Auth: Register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, campusId } = req.body;

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const newUser = new User({
      name,
      email,
      password, // Store as-is (bcrypt recommended for production!)
      role,
      campus: role === 'campus-admin' ? campusId : null
    });

    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Registration error' });
  }
});

// Auth: Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    if (user.password !== password) {
      return res.status(400).json({ message: 'Incorrect password' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user });
  } catch {
    res.status(500).json({ message: 'Login error' });
  }
});

// Campus: Create (Super Admin only)
app.post('/api/campuses', authMiddleware, async (req, res) => {
  if (req.user.role !== 'super-admin') return res.status(403).json({ message: 'Access denied' });

  const { name, location } = req.body;
  try {
    const newCampus = new Campus({ name, location });
    await newCampus.save();
    res.status(201).json(newCampus);
  } catch {
    res.status(500).json({ message: 'Could not create campus' });
  }
});

// Teaching: Post Teaching
app.post('/api/teachings', authMiddleware, async (req, res) => {
  const { title, description, videoUrl, campusId } = req.body;

  try {
    const teaching = new Teaching({
      title,
      description,
      videoUrl,
      postedBy: req.user.id,
      campus: req.user.role === 'super-admin' ? null : campusId
    });
    await teaching.save();
    res.status(201).json(teaching);
  } catch {
    res.status(500).json({ message: 'Error posting teaching' });
  }
});

// Teaching: Get All Teachings (optionally filter by campus)
app.get('/api/teachings', async (req, res) => {
  const { campusId } = req.query;
  try {
    const teachings = await Teaching.find(campusId ? { campus: campusId } : { campus: null })
      .populate('postedBy', 'name role')
      .sort({ createdAt: -1 });

    res.json(teachings);
  } catch {
    res.status(500).json({ message: 'Error fetching teachings' });
  }
});

// Teaching: Like
app.post('/api/teachings/:id/like', async (req, res) => {
  try {
    const teaching = await Teaching.findById(req.params.id);
    teaching.likes++;
    await teaching.save();
    res.json({ likes: teaching.likes });
  } catch {
    res.status(500).json({ message: 'Error liking post' });
  }
});

// Teaching: Comment
app.post('/api/teachings/:id/comment', async (req, res) => {
  const { name, comment } = req.body;
  try {
    const teaching = await Teaching.findById(req.params.id);
    teaching.comments.push({ name, comment });
    await teaching.save();
    res.json(teaching.comments);
  } catch {
    res.status(500).json({ message: 'Error commenting' });
  }
});

// Teaching: View Counter
app.post('/api/teachings/:id/view', async (req, res) => {
  try {
    const teaching = await Teaching.findById(req.params.id);
    teaching.views++;
    await teaching.save();
    res.json({ views: teaching.views });
  } catch {
    res.status(500).json({ message: 'Error counting view' });
  }
});

// Testimony: Submit
app.post('/api/testimonies', async (req, res) => {
  const { name, message } = req.body;
  try {
    const testimony = new Testimony({ name, message });
    await testimony.save();
    res.status(201).json({ message: 'Testimony submitted for approval' });
  } catch {
    res.status(500).json({ message: 'Error submitting testimony' });
  }
});

// Prayer: Submit
app.post('/api/prayers', async (req, res) => {
  const { name, request } = req.body;
  try {
    const prayer = new PrayerRequest({ name, request });
    await prayer.save();
    res.status(201).json({ message: 'Prayer request submitted' });
  } catch {
    res.status(500).json({ message: 'Error submitting prayer' });
  }
});

// ----------------------
// 5. Start the Server
// ----------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
