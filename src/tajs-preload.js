TAJS_makeContextSensitive(__rfjs_res, 0);
TAJS_makeContextSensitive(__rfjs_wrap, 0);

function __rfjs_res(y) {
	TAJS_addContextSensitivity('y');
	var ret = TAJS_newObject();
	ret.__rfjs_r = (y == null) ? 0 : function () {
		return y;
	};
	return ret;
}

function __rfjs_wrap(x) {
	TAJS_addContextSensitivity('x');
	if(typeof x == "object" && x.__rfjs_r){
		return x.__rfjs_r;
	} else {
		return function () {
			return x;
		}
	}
}