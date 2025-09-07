// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();

// ---------- Middleware ----------
app.use(express.json());

// CORS – add your frontend origins as needed
app.use(
  cors({
    origin: [
      "http://localhost:8080",            // local static hosting
      "http://127.0.0.1:5500",
      "https://harvesters-hub.vercel.app", // e.g. Vercel domain
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// ---------- MongoDB ----------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ---------- Cloudinary ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

//-----------YouTube---------------
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;

// Storage: sends files straight to Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "harvesters_hub",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    resource_type: "image" // ensure images only
  })
});

const upload = multer({ storage });

// ---------- Mongoose Schema---------
const ImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true }, // Cloudinary URL

    // ✅ new field: identify if it's an image or video
    type: { type: String, enum: ["image", "video"], required: true },

    comments: { type: String, default: "" },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: String }],

    // ✅ Uploader info
    uploaderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    uploaderRole: { type: String, enum: ["campus", "district", "cell"], required: true },
    uploaderName: { type: String, required: true },
    uploaderLogo: { type: String, required: true },

    dateUploaded: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

const campusSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  logo: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // stored as plain text now
}, { timestamps: true });


const districtSchema = new mongoose.Schema({
  name: { type: String, required: true },
  campus: { type: mongoose.Schema.Types.ObjectId, ref: "Campus", required: true }, // linked campus
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // stored plain for now
  logo: { type: String }
}, { timestamps: true });

const cellSchema = new mongoose.Schema({
  name: { type: String, required: true },
  campus: { type: mongoose.Schema.Types.ObjectId, ref: "Campus", required: true },
  district: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true },
  address: { type: String, required: true },
  leader: { type: String, required: true },
  phone: { type: String, required: true},
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // plain since no bcrypt
  logo: { type: String },
  dateRegistered: { type: Date, default: Date.now },
});

const memberSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  address: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  district: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true },
  cell: { type: mongoose.Schema.Types.ObjectId, ref: "Cell", required: true },
  createdAt: { type: Date, default: Date.now }
});

// ---------- Mongoose Models ---------
const Image = mongoose.model("Image", ImageSchema);
const Campus = mongoose.model("Campus", campusSchema);
const District = mongoose.model("District", districtSchema);
const Cell = mongoose.model("Cell",cellSchema);
const Member = mongoose.model("Member",memberSchema);
// ---------- Routes ----------

// Health probe
app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});


// Upload route (images + videos, multiple files, one comment)
app.post("/api/upload", upload.array("files"), async (req, res) => {
  try {
    const {
      comment,
      uploaderId,
      uploaderRole,
      uploaderName,
      uploaderLogo
    } = req.body;

    if (!uploaderId || !uploaderRole || !uploaderName || !uploaderLogo) {
      return res.status(400).json({ success: false, error: "Uploader info missing" });
    }

    const savedDocs = await Promise.all(
      req.files.map(file => {
        const isVideo = file.mimetype.startsWith("video");
        const newImage = new Image({
          url: file.path,
          type: isVideo ? "video" : "image",
          comments: comment,
          likes: 0,
          likedBy: [],
          uploaderId,
          uploaderRole,
          uploaderName,
          uploaderLogo
        });
        return newImage.save();
      })
    );

    res.json({
      success: true,
      message: "Files uploaded successfully ✅",
      files: savedDocs
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, error: "Upload failed ❌" });
  }
});

// GET all uploads
app.get("/api/uploads", async (req, res) => {
  try {
    const uploads = await Image.find().sort({ createdAt: -1 });
    res.json({ success: true, data: uploads });
  } catch (err) {
    console.error("Error fetching uploads:", err);
    res.status(500).json({ success: false, message: "Failed to fetch uploads" });
  }
});

// POST: like/unlike by Mongo _id
app.post("/api/uploads/:id/like", async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: "deviceId required" });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid image ID" });
    }

    const image = await Image.findById(id);
    if (!image) return res.status(404).json({ error: "Image not found" });

    const already = image.likedBy.includes(deviceId);
    if (already) {
      image.likes = Math.max(0, image.likes - 1);
      image.likedBy = image.likedBy.filter(d => d !== deviceId);
    } else {
      image.likes += 1;
      image.likedBy.push(deviceId);
    }

    // ✅ Skip validation for like/unlike updates
    await image.save({ validateBeforeSave: false });

    res.json({ likes: image.likes, liked: !already });
  } catch (err) {
    console.error("Like/unlike error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Single Post View Route (use Image model)
app.get("/api/uploads/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const image = await Image.findById(id);  // <-- use Image model

    if (!image) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    res.json({
      success: true,
      data: {
        _id: image._id,
        url: image.url,
        comments: image.comments,
        likes: image.likes,
        likedBy: image.likedBy,
        createdAt: image.createdAt,
        updatedAt: image.updatedAt,
      }
    });
  } catch (error) {
    console.error("❌ Error fetching post:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// --------------------------------------------------
// Register Campus
// --------------------------------------------------
app.post("/api/campus/register", upload.single("logo"), async (req, res) => {
  try {
    const { name, address, email, password } = req.body;

    if (!name || !address || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // check if campus already exists
    const existing = await Campus.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Campus already exists" });
    }

    // multer-storage-cloudinary gives us secure_url in req.file.path
    let logoUrl = "";
    if (req.file && req.file.path) {
      logoUrl = req.file.path;
    }

    const newCampus = new Campus({
      name,
      address,
      email,
      logo: logoUrl,
      password, // plain password for now
    });

    await newCampus.save();

    res.status(201).json({
      success: true,
      message: "Campus registered successfully",
      campus: newCampus,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// --------------------------------------------------
// Login Campus
// --------------------------------------------------
app.post("/api/campus/login", async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier = name OR email

    if (!identifier || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const campus = await Campus.findOne({
      $or: [{ email: identifier }, { name: identifier }],
    });

    if (!campus) {
      return res.status(404).json({ message: "Campus not found" });
    }

    if (campus.password !== password) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    res.status(200).json({
      success: true,
      message: "Login successful",
      campus,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// --------------------------------------------------
// Get Campus (all or single)
// --------------------------------------------------
app.get("/api/campus/:id?", async (req, res) => {
  try {
    if (req.params.id) {
      const campus = await Campus.findById(req.params.id);
      if (!campus) return res.status(404).json({ success: false, message: "Campus not found" });
      return res.json({ success: true, data: campus });
    }

    const campuses = await Campus.find().sort({ createdAt: -1 });
    res.json({ success: true, data: campuses });
  } catch (error) {
    console.error("Error fetching campus:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// --------------------------------------------------
// Register District
// --------------------------------------------------
app.post("/api/district/register", upload.single("logo"), async (req, res) => {
  try {
    const { name, campus, email, password } = req.body;

    if (!name || !campus || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if campus exists
    const campusExists = await Campus.findById(campus);
    if (!campusExists) {
      return res.status(400).json({ message: "Invalid campus ID" });
    }

    // Check if district email already exists
    const existing = await District.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "District already exists" });
    }

    // Handle logo upload
    let logoUrl = "";
    if (req.file && req.file.path) {
      logoUrl = req.file.path;
    }

    const newDistrict = new District({
      name,
      campus,
      email,
      password, // plain text
      logo: logoUrl
    });

    await newDistrict.save();

    res.status(201).json({
      success: true,
      message: "District registered successfully",
      district: newDistrict
    });
  } catch (error) {
    console.error("District registration error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// --------------------------------------------------
// Login District
// --------------------------------------------------
app.post("/api/district/login", async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier = name OR email

    if (!identifier || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Find district by email OR name
    const district = await District.findOne({
      $or: [{ email: identifier }, { name: identifier }]
    }).populate("campus", "name email");

    if (!district) {
      return res.status(404).json({ message: "District not found" });
    }

    if (district.password !== password) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    res.status(200).json({
      success: true,
      message: "Login successful",
      district
    });
  } catch (error) {
    console.error("District login error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// --------------------------------------------------
// Get District (all or single)
// --------------------------------------------------
app.get("/api/district/:id?", async (req, res) => {
  try {
    if (req.params.id) {
      const district = await District.findById(req.params.id).populate("campus", "name email");
      if (!district) return res.status(404).json({ success: false, message: "District not found" });
      return res.json({ success: true, data: district });
    }

    const districts = await District.find()
      .populate("campus", "name email")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: districts });
  } catch (error) {
    console.error("Error fetching district:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
      

// ✅ Register Cell
app.post("/api/cell/register", upload.single("logo"), async (req, res) => {
  try {
    const { name, campus, district, address, leader, phone, email, password } = req.body;

    if (!name || !campus || !district || !address || !leader || !phone || !email || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // check if email exists
    const existing = await Cell.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: "Cell already exists" });
    }

    let logoUrl = "";
    if (req.file) {
      logoUrl = req.file.path; // Cloudinary auto uploads via multer-storage-cloudinary
    }

    const newCell = new Cell({
      name,
      campus,
      district,
      address,
      leader,
      phone,
      email,
      password,
      logo: logoUrl,
    });

    await newCell.save();

    res.status(201).json({ success: true, message: "Cell registered successfully", data: newCell });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error registering cell", error: err.message });
  }
});

// CELL LOGIN
app.post("/api/cell/login", async (req, res) => {
  try {
    const { identifier, password } = req.body; 
    // identifier can be name or email

    const cell = await Cell.findOne({
      $or: [{ name: identifier }, { email: identifier }],
    })
      .populate("campus", "name")   // get campus name
      .populate("district", "name"); // get district name

    if (!cell) {
      return res.status(404).json({ success: false, message: "Cell not found" });
    }

    if (cell.password !== password) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    res.status(200).json({
      success: true,
      message: "Login successful",
      cell: {
        id: cell._id,
        name: cell.name,
        address: cell.address,
        leader: cell.leader,
        phone: cell.phone,
        email: cell.email,
        campus: cell.campus?.name,
        district: cell.district?.name,
        logo: cell.logo,
      },
    });
  } catch (err) {
    console.error("Cell login error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// --------------------------------------------------
// Get Cell (all or single)
// --------------------------------------------------
app.get("/api/cell/:id?", async (req, res) => {
  try {
    if (req.params.id) {
      const cell = await Cell.findById(req.params.id)
        .populate("campus", "name")
        .populate("district", "name");
      if (!cell) return res.status(404).json({ success: false, message: "Cell not found" });
      return res.json({ success: true, data: cell });
    }

    const cells = await Cell.find()
      .populate("campus", "name")
      .populate("district", "name");

    res.json({ success: true, data: cells });
  } catch (error) {
    console.error("Error fetching cell:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Fetch districts under a campus (for dropdown)
app.get("/api/districts", async (req, res) => {
  try {
    const { campus } = req.query;
    let query = {};
    if (campus) query.campus = campus;

    const districts = await District.find(query).populate("campus", "name");
    res.json({ success: true, data: districts });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching districts", error: err.message });
  }
});

// ======================
// Universal Login
// ======================
app.post("/api/universal-login", async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier = email | campus | district | cell

    if (!identifier || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    let user = null;
    let role = "";

    // 1. Check Campus
    user = await Campus.findOne({ $or: [{ email: identifier }, { name: identifier }] });
    if (user) role = "campus";

    // 2. Check District
    if (!user) {
      user = await District.findOne({ $or: [{ email: identifier }, { name: identifier }] });
      if (user) role = "district";
    }

    // 3. Check Cell
    if (!user) {
      user = await Cell.findOne({ $or: [{ email: identifier }, { name: identifier }] });
      if (user) role = "cell";
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Compare password
    const isMatch = password === user.password; // ❗ Replace with bcrypt.compare() if hashed
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    // ✅ Return role + user details (with logo)
    res.json({
      message: "Login successful",
      role,
      user: {
        id: user._id,
        name: user.name || user.email,
        email: user.email,
        logo: user.logo || ""   // 👈 include logo if exists
      }
    });

  } catch (err) {
    console.error("Error in universal login:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ======================
// Register a Member
// ======================
app.post("/api/members/register", async (req, res) => {
  try {
    const { fullName, address, phone, email, district, cell } = req.body;

    if (!fullName || !address || !phone || !email || !district || !cell) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if email already exists
    const existing = await Member.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const member = new Member({ fullName, address, phone, email, district, cell });
    await member.save();

    res.status(201).json({ message: "Member registered successfully", member });
  } catch (err) {
    console.error("Error registering member:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ======================
// Fetch Cells by District
// ======================
app.get("/api/cells/by-district/:districtId", async (req, res) => {
  try {
    const cells = await Cell.find({ district: req.params.districtId });
    res.json(cells);
  } catch (err) {
    console.error("Error fetching cells:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ======================
// Fetch Members (filtered by roleId)
// ======================
app.get("/api/members", async (req, res) => {
  try {
    const roleId = parseInt(req.query.roleId); // e.g., 1 = campus, 2 = district, 3 = cell
    const userId = req.query.userId;          // the actual logged-in entity's ID

    let filter = {};

    if (roleId === 3) {
      // Cell leader → only members in this cell
      filter.cell = userId;
    } else if (roleId === 2) {
      // District leader → only members in this district
      filter.district = userId;
    }
    // roleId === 1 (campus) → see all members (no filter)

    const members = await Member.find(filter)
      .populate("district", "name")
      .populate("cell", "name");

    res.json(members);
  } catch (err) {
    console.error("Error fetching members:", err);
    res.status(500).json({ message: "Server error" });
  }
});

//=======================
// 🔴 Fetch Live Feeds
//=======================
app.get("/api/live", async (req, res) => {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&eventType=live&type=video&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch live data" });
  }
});

// Global error handler – always return JSON
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

// ---------- Start ----------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Backend listening on port ${PORT}`));
