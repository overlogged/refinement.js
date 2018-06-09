TAJS_makeContextSensitive(__rfjs_res, 0);

function __rfjs_null() {
	var ret = TAJS_newObject();
	ret.__rfjs_r = 0;
	return ret;
}

function __rfjs_res(y) {
	TAJS_addContextSensitivity('y');
	var ret = TAJS_newObject();
	ret.__rfjs_r = function () {
		return y;
	};
	return ret;
}

function __rfjs_wrap(x) {
	TAJS_addContextSensitivity('x');
	if (typeof x == "object" && x.__rfjs_r) {
		return x.__rfjs_r;
	} else {
		return function () {
			return x;
		}
	}
}