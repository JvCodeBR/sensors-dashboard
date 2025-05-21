const mongoose = require("mongoose");

const sensorSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  token: { type: String, required: true },
  registeredAt: { type: Date, required: true },
});

module.exports = mongoose.model("Sensor", sensorSchema);
