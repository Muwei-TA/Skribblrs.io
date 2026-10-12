const validate = require('./validation');

class Canvas {
    constructor(io, socket) {
        this.io = io;
        this.socket = socket;
    }

    broadcastDrawing(input) {
        validate.drawer(this.socket, 'drawing');
        const data = validate.drawing(input);
        this.socket.to(this.socket.roomID).emit('drawing', data);
    }

    clearCanvas() {
        validate.drawer(this.socket, 'drawing');
        this.socket.to(this.socket.roomID).emit('clearCanvas');
    }
}

module.exports = Canvas;
