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
    url: { type: String, required: true },
    comments: { type: String, default: "" },
    likes: { type: Number, default: 0 },  // ✅ added this
    likedBy: [{ type: String }],          // ✅ optional, store userIds if needed
    dateUploaded: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// ---------- Mongoose Models ---------
const Image = mongoose.model("Image", ImageSchema);

// ---------- Routes ----------

// Health probe
app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// 🔹 Upload route (MULTIPLE files + comment)
app.post("/api/upload", upload.array("files"), async (req, res) => {
  try {
    const comment = req.body.comment || "";

    // Save each file as a new document in MongoDB
    const savedDocs = await Promise.all(
      req.files.map(file => {
        const newImage = new Image({
          url: file.path,          // Cloudinary URL
          comments: comment,       // One comment for all
          likes: 0,                // ✅ initialize likes
          likedBy: []              // ✅ initialize empty array
        });
        return newImage.save();
      })
    );

    res.json({
      message: "Files uploaded and saved successfully ✅",
      files: savedDocs,   // return the saved DB docs
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed ❌" });
  }
});

// Get uploads (newest first)
app.get("/api/uploads", async (req, res) => {
  try {
    const { resources } = await cloudinary.api.resources({
      type: "upload",
      max_results: 20, // adjust as needed
    });

    res.json({ success: true, data: resources });
  } catch (error) {
    console.error("Error fetching uploads:", error);
    res.status(500).json({ success: false, message: "Failed to fetch uploads" });
  }
});

// Like/Unlike toggle
app.post("/api/:id/like", async (req, res) => {
  try {
    const { id } = req.params;
    const { deviceId } = req.body;

    const image = await Image.findById(id);
    if (!image) return res.status(404).json({ error: "Image not found" });

    // Check if device already liked
    const alreadyLiked = image.likedBy.includes(deviceId);

    if (alreadyLiked) {
      // Unlike
      image.likes = Math.max(0, image.likes - 1);
      image.likedBy = image.likedBy.filter(d => d !== deviceId);
    } else {
      // Like
      image.likes += 1;
      image.likedBy.push(deviceId);
    }

    await image.save();

    res.json({
      success: true,
      likes: image.likes,
      liked: !alreadyLiked,
    });
  } catch (error) {
    console.error("Like toggle error:", error);
    res.status(500).json({ error: "Server error" });
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
