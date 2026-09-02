export const TRACE_JOIN_OVERLAP_PX = 2;

export function getTimelineSliceGeometry({
    x0,
    x1,
    startTime,
    endTime,
    width,
    joinFromPrevious = false
}) {
    if (x1 <= x0 || endTime <= startTime || width <= 0) return null;

    const secondsPerPixel = (endTime - startTime) / (x1 - x0);
    const paintX0 = joinFromPrevious && x0 > 0
        ? Math.max(0, x0 - TRACE_JOIN_OVERLAP_PX)
        : x0;

    return {
        paintX0,
        paintStartTime: startTime - (x0 - paintX0) * secondsPerPixel,
        secondsPerPixel,
        startCol: Math.max(0, Math.floor(paintX0)),
        endCol: Math.min(width, Math.ceil(x1)),
        anchorCol: joinFromPrevious && paintX0 > 0
            ? Math.max(0, Math.floor(paintX0) - 1)
            : null
    };
}
