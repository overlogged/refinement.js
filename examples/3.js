function Blob(){
    this.ghost_available = true;
    
    this.close = function(){
        this.ghost_available = false;
    }
}

function createObjectURL(blob){
    requires(blob.ghost_available);
}

var blob = new Blob();
createObjectURL(blob);
var blob_alias = blob;
blob_alias.close();
createObjectURL(blob);