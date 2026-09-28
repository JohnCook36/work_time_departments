import { createActivationQrMatrix } from '../../auth/activationQr';

interface ActivationQrProps {
  value: string;
  size?: number;
}

export function ActivationQr({ value, size = 196 }: ActivationQrProps) {
  const matrix = createActivationQrMatrix(value);
  const quietZone = 4;
  const viewSize = matrix.length + quietZone * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={'0 0 ' + viewSize + ' ' + viewSize}
      role="img"
      aria-label="QR-код активации"
      shapeRendering="crispEdges"
    >
      <rect width={viewSize} height={viewSize} fill="white" />
      {matrix.flatMap((row, rowIndex) =>
        row.map((dark, colIndex) =>
          dark ? (
            <rect
              key={rowIndex + ':' + colIndex}
              x={colIndex + quietZone}
              y={rowIndex + quietZone}
              width="1"
              height="1"
              fill="black"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
