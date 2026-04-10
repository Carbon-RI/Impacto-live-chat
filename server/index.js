require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;

const app = express();
app.use(cors());

// Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] },
});

// Socket.io event handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // receive_message
  socket.on("send_message", async (data) => {
    let responseData = { ...data };

    if (data.file) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(data.file, {
          resource_type: "auto",
          folder: "impact_livechat",
        });

        responseData.file = uploadResponse.secure_url;
        responseData.resourceType = uploadResponse.resource_type;
        delete responseData.file;
      } catch (error) {
        console.error("Cloudinary Upload Error", error);
      }
    }
    // Broadcast the message to all clients
    io.emit("receive_message", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
