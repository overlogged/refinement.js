function Buffer(){

}

function GL(){
    this.createBuffer = function(){
        var bf = new Buffer();
        bf.ghost_gl = this;
        return bf;
    }
    
    this.bindBuffer = function(bf){
        requires(bf.ghost_gl == this);
    }
}

function magic_function(obj){
    obj.magic = 1;
    return obj;
}

var gl = new GL();
var gl2 = new GL();
var bf = magic_function(gl.createBuffer());
gl.bindBuffer(bf);
gl2.bindBuffer(bf);