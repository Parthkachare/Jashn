const watermarkCount = 80;

export default function DemoWatermark() {
  return (
    <div className="demo-watermark" aria-hidden="true">
      <div className="demo-watermark-pattern">
        {Array.from({ length: watermarkCount }, (_, index) => (
          <span key={index}>@demo</span>
        ))}
      </div>
    </div>
  );
}
