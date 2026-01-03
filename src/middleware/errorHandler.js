// Handle payload-too-large errors explicitly so the server doesn't crash
export const errorHandler = (err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    console.error('Request payload too large:', err.message);
    return res.status(413).json({ error: 'Payload too large', details: err.message });
  }
  return next(err);
};
