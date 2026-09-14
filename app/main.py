from fastapi import FastAPI, HTTPException, Query, Depends
from pydantic import BaseModel, Field
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

SECRET_KEY = "your_secret_key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="admin/login")

class Admin(BaseModel):
    username: str
    password: str

class Medicine(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    price: float = Field(gt=0)
    description: str = Field(max_length=200)
    stock: int = Field(ge=0)
    category: str = Field(min_length=1, max_length=50)

class MedicineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    price: float | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=200)
    stock: int | None = Field(default=None, ge=0)
    category: str | None = Field(default=None, min_length=1, max_length=50)

class MedicineResponse(BaseModel):
    id: int
    name: str
    price: float
    description: str
    stock: int
    category: str

class CartItem(BaseModel):
    medicine_id: int
    quantity: int = Field(gt=0)

class CartUpdate(BaseModel):
    quantity: int = Field(gt=0)

class OrderItem(BaseModel):
    medicine_id: int
    name: str
    quantity: int
    price: float
    total_price: float


class Order(BaseModel):
    id: int
    items: list[OrderItem]
    total_price: float
    status: str

app = FastAPI(title="PharmaHub API")

admin_credentials = {
    "username": "admin",
    "password": "admin123"
}
next_medicine_id = 1
medicines = {
  1: {
    "name": "Paracetamol",
    "price": 500,
    "description": "Pain and fever relief",
    "stock": 100,
    "category": "Pain Relief"
  }
}
cart = {}
orders = {}
next_order_id = 1

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_admin(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        username = payload.get("sub")

        if username is None:
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    if username != admin_credentials["username"]:
        raise credentials_exception

    return username

@app.get("/")
def home():
    return {"message": "Welcome to PharmaHub"}

@app.get("/medicines", response_model=list[MedicineResponse])
def get_medicines():
    return [MedicineResponse(id=id, **medicine) for id, medicine in medicines.items()]

@app.get("/medicines/search", response_model=list[MedicineResponse])
def search_medicines(
    name: str | None = Query(None, min_length=1, max_length=50),
    category: str | None = Query(None, min_length=1, max_length=50),
    min_price: float | None = Query(None, ge=0),
    max_price: float | None = Query(None, ge=0),
    in_stock: bool | None = Query(None)
):
    results = []

    for id, medicine in medicines.items():

        if name and name.lower() not in medicine["name"].lower():
            continue

        if category and category.lower() != medicine["category"].lower():
            continue

        if min_price is not None and medicine["price"] < min_price:
            continue

        if max_price is not None and medicine["price"] > max_price:
            continue

        if in_stock is True and medicine["stock"] == 0:
            continue

        if in_stock is False and medicine["stock"] > 0:
            continue

        results.append(MedicineResponse(id=id, **medicine))

    return results

@app.get("/cart")
def get_cart():
    cart_items = []
    total_price = 0.0
    for medicine_id, quantity in cart.items():
        medicine = medicines.get(medicine_id)
        if medicine:
            cart_items.append({
                "medicine_id": medicine_id,
                "name": medicine["name"],
                "quantity": quantity,
                "price": medicine["price"],
                "total_price": medicine["price"] * quantity
            })
            total_price += medicine["price"] * quantity
    return {"cart": cart_items, "total_price": total_price}

@app.get("/medicines/{medicine_id}", response_model=MedicineResponse)
def get_medicine(medicine_id: int):
    medicine = medicines.get(medicine_id)
    if medicine:
        return MedicineResponse(id=medicine_id, **medicine)
    raise HTTPException(status_code=404, detail="Medicine not found")

@app.get("/admin/orders", response_model=list[Order])
def get_orders(current_admin: str = Depends(get_current_admin)):
    return list(orders.values())

@app.get("/orders/{order_id}", response_model=Order)
def get_order(order_id: int, current_admin: str = Depends(get_current_admin)):
    order = orders.get(order_id)
    if order:
        return order
    raise HTTPException(status_code=404, detail="Order not found")

@app.post("/medicines", response_model=MedicineResponse)
def add_medicine(medicine: Medicine, current_admin: str = Depends(get_current_admin)):
    global next_medicine_id

    medicines[next_medicine_id] = medicine.model_dump()

    created_medicine = MedicineResponse(
        id=next_medicine_id,
        **medicines[next_medicine_id]
    )
    next_medicine_id += 1

    return created_medicine

@app.post("/cart")
def add_to_cart(item: CartItem):
    medicine = medicines.get(item.medicine_id)
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")

    previous_quantity = cart.get(item.medicine_id, 0)

    new_quantity = previous_quantity + item.quantity

    if medicine["stock"] < new_quantity:
        raise HTTPException(
            status_code=400,
            detail="Not enough stock available"
        )

    cart[item.medicine_id] = new_quantity

    return {"message": f"Added {cart[item.medicine_id]} of {medicine['name']} to cart."}

@app.post("/checkout")
def checkout():
    if not cart:
        raise HTTPException(status_code=400, detail="Cart is empty")

    order_items = []
    total_price = 0.0

    for medicine_id, quantity in cart.items():
        medicine = medicines.get(medicine_id)
        if not medicine:
            raise HTTPException(status_code=404, detail=f"Medicine with ID {medicine_id} not found")

        if medicine["stock"] < quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough stock for {medicine['name']}. Available: {medicine['stock']}, Requested: {quantity}"
            )

        total_price += medicine["price"] * quantity
        order_items.append(OrderItem(
            medicine_id=medicine_id,
            name=medicine["name"],
            quantity=quantity,
            price=medicine["price"],
            total_price=medicine["price"] * quantity
        ))

    global next_order_id
    order = Order(
        id=next_order_id,
        items=order_items,
        total_price=total_price,
        status="Pending"
    )
    orders[next_order_id] = order
    next_order_id += 1

    for item in order_items:
        medicines[item.medicine_id]["stock"] -= item.quantity

    cart.clear()

    return {"message": "Order placed successfully", "order": order}

@app.post("/admin/login")
def admin_login(form_data: OAuth2PasswordRequestForm = Depends()):
    if form_data.username == admin_credentials["username"] and form_data.password == admin_credentials["password"]:
        access_token = create_access_token(data={"sub": form_data.username})
        return {"access_token": access_token, "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.put("/medicines/{medicine_id}", response_model=MedicineResponse)
def update_medicine(medicine_id: int, medicine: MedicineUpdate, current_admin: str = Depends(get_current_admin)):
    if medicine_id not in medicines:
        raise HTTPException(status_code=404, detail="Medicine not found")

    current_medicine = medicines[medicine_id]

    updated_medicine = {
        **current_medicine,
        **medicine.model_dump(exclude_unset=True)
    }

    medicines[medicine_id] = updated_medicine

    return MedicineResponse(
        id=medicine_id,
        **updated_medicine
    )   

@app.put("/cart/{medicine_id}")
def update_cart_item(medicine_id: int, item: CartUpdate):
    if medicine_id not in medicines:
        raise HTTPException(status_code=404, detail="Medicine not found")

    if medicine_id not in cart:
        raise HTTPException(status_code=404, detail="Item not found in cart")

    if medicines[medicine_id]["stock"] < item.quantity:
        raise HTTPException(status_code=400, detail="Not enough stock available")

    cart[medicine_id] = item.quantity

    return {"message": f"Updated cart item for medicine ID {medicine_id} to quantity {item.quantity}"}
   
@app.delete("/medicines/{medicine_id}", response_model=MedicineResponse)
def delete_medicine(medicine_id: int, current_admin: str = Depends(get_current_admin)):
    if medicine_id in medicines:
        deleted_medicine = MedicineResponse(id=medicine_id, **medicines[medicine_id])
        del medicines[medicine_id]
        return deleted_medicine
    raise HTTPException(status_code=404, detail="Medicine not found")  

@app.delete("/cart/{medicine_id}")
def remove_from_cart(medicine_id: int):
    if medicine_id in cart:
        del cart[medicine_id]
        return {"message": "Item removed from cart"}
    raise HTTPException(status_code=404, detail="Item not found in cart")
