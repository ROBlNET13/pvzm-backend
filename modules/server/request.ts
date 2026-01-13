export function getClientIP(req: any): string {
	const cfIp = req.headers?.["cf-connecting-ip"];
	const forwardedIp = req.headers?.["x-forwarded-for"];
	const remoteIp = req.socket?.remoteAddress || "";

	return cfIp || (typeof forwardedIp === "string" ? forwardedIp : "") || remoteIp;
}
