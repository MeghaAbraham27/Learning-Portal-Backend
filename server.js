const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./authRoutes");
const adminRoutes = require("./adminRoutes");
const mockTestRoutes = require("./mockTestRoutes");


const app = express();

app.use(cors());
app.use(express.json()); 

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/test", mockTestRoutes);

app.listen(5000, () => {
  console.log("Server running on my port 5000");
});
