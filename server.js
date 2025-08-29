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
      "http://localhost:5500",            // local static hosting
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

// ---------- Mongoose Models ----------
const ImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    comments: { type: String, default: "" },
    dateUploaded: { type: Date, default: Date.now }
  },
  { timestamps: true }
);
const Image = mongoose.model("Image", ImageSchema);

// ---------- Routes ----------

// Health probe
app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Get images (newest first)
app.get("/api/images", async (req, res) => {
  try {
    const images = await Image.find().sort({ createdAt: -1 });
    res.json({ success: true, images });
  } catch (error) {
    console.error("Fetch images error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch images" });
  }
});

// Upload multiple images, one shared comment
// Expecting field name: "images" (multiple files) + "comments" (string)
app.post("/api/upload", upload.array("images", 12), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "No files uploaded" });
    }

    const comment = req.body.comments || "";

    const saved = [];
    for (const file of req.files) {
  console.log("Cloudinary upload file object:", file); // 🔍 Debug

  const imageUrl = file.path || file.secure_url || file.url;
  if (!imageUrl) {
    throw new Error("No Cloudinary URL found in upload response");
  }

  const doc = new Image({ url: imageUrl, comments: comment });
  await doc.save();
  saved.push(doc);
       }

    res.json({
      success: true,
      message: `${saved.length} image(s) uploaded successfully`,
      images: saved
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Upload failed"
    });
  }
});

// Return JSON for unknown /api routes (prevents HTML DOCTYPE leaks)
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "API route not found" });
});

// Fallback (non-API): don’t serve HTML here (frontend is separate)
// Always respond JSON to avoid "<!DOCTYPE" in consumers
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Not found" });
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
