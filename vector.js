// Vector utility functions for 2D arrays
const V = Array.prototype;

V.add = function (other) {
  this[0] += other[0];
  this[1] += other[1];
  return this;
};

V.plus = function (other) {
  return [this[0] + other[0], this[1] + other[1]];
};

V.minus = function (other) {
  return [this[0] - other[0], this[1] - other[1]];
};

V.times = function (scalar) {
  return [this[0] * scalar, this[1] * scalar];
};

V.over = function (scalar) {
  return [this[0] / scalar, this[1] / scalar];
};

V.rotate = function (angle) {
  return [
    this[0] * Math.cos(angle) - this[1] * Math.sin(angle),
    this[0] * Math.sin(angle) + this[1] * Math.cos(angle),
  ];
};

V.distSq = function (other) {
  return (this[0] - other[0]) ** 2 + (this[1] - other[1]) ** 2;
};

const TAU = 2 * Math.PI;
