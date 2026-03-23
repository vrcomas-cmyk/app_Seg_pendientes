"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestDueDate = suggestDueDate;
function suggestDueDate(priority) {
    const daysMap = { alta: 1, media: 3, baja: 7 };
    const date = new Date();
    date.setDate(date.getDate() + daysMap[priority]);
    return date.toISOString().split('T')[0];
}
