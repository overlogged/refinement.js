function sqrt(x) {
	requires(x>=0);
	var result = Math.sqrt(x);
	assert(result>0);
	return result;
	ensures(function(res){return res>=0;});
}

function fun(){}

var is_prime = function(n){
	for(var i=2;i*i<n;i++) if(n%i==0) return true;
	return false;
}

sqrt(4);
sqrt(-1);
sqrt(0);
is_prime(3);