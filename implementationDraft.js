/*
basic strategy for using SVG:
In SVG you can draw on an arbitrarily large plane and have a "viewbox" that shows a sub-area of that.
Because of this, for a piano roll, you can "draw" a piano-roll at an arbitrary size and move around
the viewbox rather than "redrawing" the piano roll when you want to zoom/move. What's TBD is to see
how annoying it might be to program selecting/dragging/highlighting/resizing with this approach. 
In general, aiming for Ableton piano-roll feature parity wrt mouse interaction (assuming keyboard 
shortcuts are trivial to implement if you can get the mouse stuff right)

order of library features to test (for each, make sure they're sensible under viewbox zoom too):
- X - dragging behavior 
- X - dragging and snap to grid
    - NOTE - clicking on a note is interpeted as a "drag" and will automatically quantize it
- multiselection + dragging via mouse
    - see what visualization of selections looks like and tweak it
    - TODO - figure out a visual higlight/selection mechanism - 
      the selection plugin doesn't do that on its own
- X - multiselection + dragging + snap to grid
- X - multiselection and ableton style resizing
- multiselected resizing + snap to grid
- figure out good UI for viewbox resizing/position control (panzoom plugin if necessary?)
    - figure out how to map mouse coordinates to SVG coordinates
- figure out cursor animation and viewbox movement for a playing piano roll

Except for zoom events, which will likely be attatched to the root SVG element, events/plugins will
only be added to the "note" svg elements

*/

//testing SVG library api
var draw;
var l1, l2;
/* a dictionary that, upon the start of a group drag/resize event, stores the 
 * initial positions and lengths of all notes so that the mouse modifications to
 * one note can be bounced to the rest of the selected notes*/
var noteModStartReference;
var notes = {};

var xSnap = 200; //x-variable will change depending on user quantization choice
var ySnap = 50;
function snapPositionToGrid(elem, xSize, ySize){
    elem.x(Math.round(elem.x()/xSize) * xSize);
    elem.y(Math.round(elem.y()/ySize) * ySize);
}
var selectedElements = new Set();
var selectRect;

var backgroundElements;

function refreshNoteModStartReference(noteIds){
    noteModStartReference = {};
    noteIds.forEach(function(id){ 
        noteModStartReference[id] = {
            x:  notes[id].x(), 
            y:  notes[id].y(), 
            //x1 is the same as x() when using a line, but keeps 
            //properties for drag/resize separate and more readable for now
            x1: notes[id].attr('x1'), 
            x2: notes[id].attr('x2')
        };
    });
}

function setMultiSelectListeners(noteElement){
    var noteIds = Array.from(selectedElements).map(elem => elem.noteId);

     refreshNoteModStartReference(noteIds);

    /* Performs the same drag deviation done on the clicked element to 
     * the other selected elements
     */
    noteElement.draggable().on('dragmove', function(event){
        var xMove = this.x() - noteModStartReference[this.noteId].x;
        var yMove = this.y() - noteModStartReference[this.noteId].y;
        var thisId = this.noteId;
        noteIds.forEach(function(id){
            if(id != thisId) {
                notes[id].x(noteModStartReference[id].x + xMove);
                notes[id].y(noteModStartReference[id].y + yMove);
            }
        });
    });

    /* remove the original dragend function which only snaps the target
     * element to the grid
     */
    noteElement.off('dragend'); 

    /* have a dragend function that snaps ALL selected elements to the grid
     */
    noteElement.draggable().on('dragend', function(event){
        selectedElements.forEach(function(elem){
            snapPositionToGrid(elem, xSnap, ySnap); 

            //refresh the startReference so the next multi-select-transform works right
            refreshNoteModStartReference(noteIds);
        });
    });

    /* Performs the same resizing done on the clicked element to 
     * the other selected elements
     */
    noteElement.on('resizing', function(event){
        var oldX1 = noteModStartReference[this.noteId].x1;
        var isEndChange = this.attr('x1') === oldX1;
        var thisId = this.noteId;
        noteIds.forEach(function(id){
            if(id != thisId){
                var oldNoteVals = noteModStartReference[id];
                if(isEndChange) notes[id].attr('x2', oldNoteVals.x2 + event.detail.dx);
                else notes[id].attr('x1', oldNoteVals.x1 + event.detail.dx);
            }
        });
    });

    //refresh the startReference so the next multi-select-transform works right
    noteElement.on('resizedone', function(event){
        refreshNoteModStartReference(noteIds);
    })
}


function selectNote(noteElem){
    selectedElements.add(noteElem);
    noteElem.stroke("#fff");
}

function deselectNote(noteElem){
    selectedElements.delete(noteElem);
    noteElem.stroke("#000");
}

function selectRectIntersection(selectRect_, noteElem){

}

function attachMouseModifierHandlers(backgroundElements_, svgParentObj){
    var svgElem = svgParentObj.node;
 
    window.addEventListener('mouseup', function(event){
        console.log("window up", event);

        //end a multi-select drag gesture
        if(selectRect) {
            if(selectedElements.size > 0 ){
                attachMultiSelectListeners(selectedElements, setMultiSelectListeners);
            }
            selectRect.draw('stop', event);
            selectRect.remove();
            svgParentObj.off("mousemove");
            selectRect = null;
        }
    });


    backgroundElements_.forEach(function(elem){
        elem.on('mousedown', function(event){
            console.log("down", event);

            //clear previous mouse multi-select gesture state
            if(selectRect) selectRect.remove();
            removeMultiSelectListeners(selectedElements);
            selectedElements.forEach(noteElem => deselectNote(noteElem));

            //restart new mouse multi-select gesture
            selectRect = svgParentObj.rect().fill('#008').attr('opacity', 0.25);
            selectRect.draw(event);
            svgParentObj.on("mousemove", function(event){
                
                //select notes which intersect with the selectRect (mouse selection area)
                Object.keys(notes).forEach(function(noteId){
                    var noteElem = notes[noteId];
                    
                    var intersecting = svgParentObj.node.checkIntersection(noteElem.node, selectRect.node.getBBox());
                    if(intersecting) {
                        selectNote(noteElem);                        
                    }
                    else {
                        deselectNote(noteElem)
                    }
                });
            })
        }); 
    });
}


SVG.on(document, 'DOMContentLoaded', function() {

    //set up a background that you can see elements against, which will 
    //later be the piano roll backdrop
    var boxSize = 200;
    draw = SVG('drawing').attr('id', 'pianoRollSVG').size(300, 300);
    var rect = draw.rect(boxSize, boxSize).attr({ fill: '#f06' });
    var rect2 = draw.rect(boxSize, boxSize).attr({ fill: '#0f6' }).move(boxSize, 0);
    var rect3 = draw.rect(boxSize, boxSize).attr({ fill: '#60f' }).move(0, boxSize);
    var rect4 = draw.rect(boxSize, boxSize).attr({ fill: '#f60' }).move(boxSize, boxSize);
    backgroundElements = [rect, rect2, rect3, rect4];

    attachMouseModifierHandlers(backgroundElements, draw);

    //set up the manipulatable elements (which will later be the notes)
    l1 = draw.line(0, 300, 200, 300).stroke({width: 10});
    l2 = draw.line(0, 100, 200, 100).stroke({width: 10});

    //every new note created will have a newly generated noteId. this
    //is a quick setup to show what the note management will look like
    notes = {0: l1, 1: l2};
    l1.noteId = 0;
    l2.noteId = 1;
    Object.keys(notes).forEach(function(key){ //adding snap-to-grid
        note = notes[key];
        note.draggable().selectize({rotationPoint: false, points:["r", "l"]}).resize()
            .on('dragend', function(event){ snapPositionToGrid(this, xSnap, ySnap)});
    });


    /* the onscreen view area (the root SVG element) is only 300x300, but we have drawn shapes 
     * that are contained in a 400x400 box. the SVG viewbox feature lets you draw arbitraily  
     * sized images and then view them at whatever scale you want in your view area
     */
    draw.viewbox(0, 0, 400, 400);
});

function attachMultiSelectListeners(selectedElements_, modHandlers){
    selectedElements_.forEach(modHandlers);   
}

function removeMultiSelectListeners(selectedElements_){
    selectedElements_.forEach(function(elem){
        elem.off('beforedrag');
        elem.off('dragmove');
        elem.off('dragend');
        elem.on('dragend', function(event){snapPositionToGrid(this, xSnap, ySnap)})
    });
}

/*
WORKING BUG LOG
- Clicking on notes snaps them all to grid - not necessarily technically a hard fix but need to 
  decide how auto-snapping will work, and need to make it work with resizing (snap start position
  on resize, but using a new function that doesn't "move" the whole note, just the start position?)
- mouseup doesn't properly get registered on background elements, drawing multi-select rect by 
  listening on the base svg element instead
    - workaround seems to be working successfully 
- mousedrag selection doesn't seem to be intersecting correctly with the note-line elements
*/


