const mongoose = require("mongoose");

const presenceSchema = new mongoose.Schema({
  sensor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Sensor",
    required: true,
  },
  type: { type: String, required: true },
  registeredAt: { type: Date, required: true },
});

module.exports = mongoose.model("Presence", presenceSchema);
