

class PianoRoll {
    constructor(canvas){
        this.canvas = canvas;
        this.canvasHeight = canvas.height;
        this.canvasWidth = canvas.width;
        this.numNotesShown = 20; //always an integer
        this.numMeasuresHown = 4; //always a multiple of 1/16

        /* This means bottom of the 60-block is aligned with the center.
         * 60.5 would mean the center is aligned with halfway through the 60-block */ 
        this.centerNote = 60; //notes are 0-indexed

        /* This means left-end of the 2-block is aligned with the center.
         * 2.5 would mean the center is aligned with halfway through the 2-block */
        this.centerMeasure = 2; //measures are 0-indexed

        this.notes = [];
    }



    drawBackground(){
        //draw the "white key" color background


        //calculate where horizontal block divisions are
        //draw the "black key" horizontal blocks
        //draw the horizontal lines

        //calculate where vertical lines are
    }

    drawNotes(){

    }
}

/*
basic strategy for using SVG:
In SVG you can draw on an arbitrarily large plane and have a "viewbox" that shows a sub-area of that.
Because of this, for a piano roll, you can "draw" a piano-roll at an arbitrary size and move around
the viewbox rather than "redrawing" the piano roll when you want to zoom/move. What's TBD is to see
how annoying it might be to program selecting/dragging/highlighting/resizing with this approach. 
*/

//testing SVG library api
var draw;
var line;
SVG.on(document, 'DOMContentLoaded', function() {
    var boxSize = 200;
    draw = SVG('drawing').size(300, 300);
    var rect = draw.rect(boxSize, boxSize).attr({ fill: '#f06' });
    var rect2 = draw.rect(boxSize, boxSize).attr({ fill: '#0f6' }).move(boxSize, 0);
    var rect3 = draw.rect(boxSize, boxSize).attr({ fill: '#60f' }).move(0, boxSize);
    var rect4 = draw.rect(boxSize, boxSize).attr({ fill: '#f60' }).move(boxSize, boxSize);
    draw.viewbox(175, 175, 30, 30);
})