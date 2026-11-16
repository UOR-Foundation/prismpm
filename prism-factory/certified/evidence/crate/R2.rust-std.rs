#![forbid(unsafe_code)]
use core::cmp::Ordering;

use core::sync::atomic::{AtomicU64, Ordering as Memory};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Overflow;

pub type R<T> = Result<T, Overflow>;

static WORK: AtomicU64 = AtomicU64::new(0);

pub fn tick(units: u64) { WORK.fetch_add(units, Memory::Relaxed); }

pub fn work() -> u64 { WORK.load(Memory::Relaxed) }

pub trait Same {
    fn same(&self, other: &Self) -> bool;
}

pub trait Key {
    fn key(&self, other: &Self) -> Ordering;
}

impl Same for bool {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for bool {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for u8 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for u8 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for u16 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for u16 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for u32 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for u32 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for u64 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for u64 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for i8 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for i8 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for i16 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for i16 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for i32 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for i32 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for i64 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for i64 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for Ordering {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl<A: Key, B: Key> Key for (A, B) {
    fn key(&self, other: &Self) -> Ordering { match self.0.key(&other.0) { Ordering::Equal => self.1.key(&other.1), decided => decided, } }
}

pub fn equal<T: Same>(a: T, b: T) -> bool { a.same(&b) }

pub fn compare<T: Key>(a: T, b: T) -> Ordering { a.key(&b) }

pub fn nat_add(p0: u64, p1: u64) -> R<u64> {
    match u64::checked_add(p0, p1) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<u64, Overflow>(Overflow)
        }
    }
}

pub fn nat_sub(p0: u64, p1: u64) -> u64 {
    u64::saturating_sub(p0, p1)
}

pub fn nat_mul(p0: u64, p1: u64) -> R<u64> {
    match u64::checked_mul(p0, p1) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<u64, Overflow>(Overflow)
        }
    }
}

pub fn nat_quot(p0: u64, p1: u64, p2: u64) -> u64 {
    u64::checked_div(p0, p1).unwrap_or(p2)
}

pub fn nat_rem(p0: u64, p1: u64, p2: u64) -> u64 {
    u64::checked_rem(p0, p1).unwrap_or(p2)
}

pub fn nat_eq(p0: u64, p1: u64) -> bool {
    core::cmp::PartialEq::eq(&p0, &p1)
}

pub fn nat_le(p0: u64, p1: u64) -> bool {
    core::cmp::PartialOrd::le(&p0, &p1)
}

pub fn nat_lt(p0: u64, p1: u64) -> bool {
    core::cmp::PartialOrd::lt(&p0, &p1)
}

pub fn nat_succ(p0: u64) -> R<u64> {
    match u64::checked_add(p0, 1u64) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<u64, Overflow>(Overflow)
        }
    }
}

pub fn int_add(p0: i64, p1: i64) -> R<i64> {
    match i64::checked_add(p0, p1) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<i64, Overflow>(Overflow)
        }
    }
}

pub fn int_sub(p0: i64, p1: i64) -> R<i64> {
    match i64::checked_sub(p0, p1) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<i64, Overflow>(Overflow)
        }
    }
}

pub fn int_mul(p0: i64, p1: i64) -> R<i64> {
    match i64::checked_mul(p0, p1) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<i64, Overflow>(Overflow)
        }
    }
}

pub fn int_neg(p0: i64) -> R<i64> {
    match i64::checked_neg(p0) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<i64, Overflow>(Overflow)
        }
    }
}

pub fn int_quot(p0: i64, p1: i64, p2: i64) -> R<i64> {
    { let value = { let (a, b, z): (i64, i64, i64) = (p0, p1, p2); if b == 0 { Some(z) } else { a.checked_div(b) } }; match value {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<i64, Overflow>(Overflow)
        }
    } }
}

pub fn int_rem(p0: i64, p1: i64, p2: i64) -> i64 {
    { let (a, b, z): (i64, i64, i64) = (p0, p1, p2); if b == 0 { z } else { a.wrapping_rem(b) } }
}

pub fn bool_not(p0: bool) -> bool {
    !p0
}

pub fn bool_and(p0: bool, p1: bool) -> bool {
    if p0 {
        p1
    } else {
        false
    }
}

pub fn bool_or(p0: bool, p1: bool) -> bool {
    if p0 {
        true
    } else {
        p1
    }
}

pub mod fixed_u8 {
    pub fn checked_add(p0: u8, p1: u8) -> Option<u8> {
        u8::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: u8, p1: u8) -> Option<u8> {
        u8::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: u8, p1: u8) -> Option<u8> {
        u8::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: u8, p1: u8) -> Option<u8> {
        u8::checked_div(p0, p1)
    }

    pub fn bit_and(p0: u8, p1: u8) -> u8 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: u8, p1: u8) -> u8 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: u8, p1: u8) -> u8 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: u8) -> u8 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: u8, p1: u32) -> Option<u8> {
        u8::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: u8, p1: u32) -> Option<u8> {
        u8::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<u8> {
        u8::try_from(p0).ok()
    }
}

pub mod fixed_u16 {
    pub fn checked_add(p0: u16, p1: u16) -> Option<u16> {
        u16::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: u16, p1: u16) -> Option<u16> {
        u16::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: u16, p1: u16) -> Option<u16> {
        u16::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: u16, p1: u16) -> Option<u16> {
        u16::checked_div(p0, p1)
    }

    pub fn bit_and(p0: u16, p1: u16) -> u16 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: u16, p1: u16) -> u16 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: u16, p1: u16) -> u16 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: u16) -> u16 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: u16, p1: u32) -> Option<u16> {
        u16::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: u16, p1: u32) -> Option<u16> {
        u16::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<u16> {
        u16::try_from(p0).ok()
    }
}

pub mod fixed_u32 {
    pub fn checked_add(p0: u32, p1: u32) -> Option<u32> {
        u32::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: u32, p1: u32) -> Option<u32> {
        u32::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: u32, p1: u32) -> Option<u32> {
        u32::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: u32, p1: u32) -> Option<u32> {
        u32::checked_div(p0, p1)
    }

    pub fn bit_and(p0: u32, p1: u32) -> u32 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: u32, p1: u32) -> u32 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: u32, p1: u32) -> u32 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: u32) -> u32 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: u32, p1: u32) -> Option<u32> {
        u32::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: u32, p1: u32) -> Option<u32> {
        u32::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<u32> {
        u32::try_from(p0).ok()
    }
}

pub mod fixed_u64 {
    pub fn checked_add(p0: u64, p1: u64) -> Option<u64> {
        u64::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: u64, p1: u64) -> Option<u64> {
        u64::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: u64, p1: u64) -> Option<u64> {
        u64::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: u64, p1: u64) -> Option<u64> {
        u64::checked_div(p0, p1)
    }

    pub fn bit_and(p0: u64, p1: u64) -> u64 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: u64, p1: u64) -> u64 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: u64, p1: u64) -> u64 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: u64) -> u64 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: u64, p1: u32) -> Option<u64> {
        u64::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: u64, p1: u32) -> Option<u64> {
        u64::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<u64> {
        u64::try_from(p0).ok()
    }
}

pub mod fixed_i8 {
    pub fn checked_add(p0: i8, p1: i8) -> Option<i8> {
        i8::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: i8, p1: i8) -> Option<i8> {
        i8::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: i8, p1: i8) -> Option<i8> {
        i8::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: i8, p1: i8) -> Option<i8> {
        i8::checked_div(p0, p1)
    }

    pub fn bit_and(p0: i8, p1: i8) -> i8 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: i8, p1: i8) -> i8 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: i8, p1: i8) -> i8 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: i8) -> i8 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: i8, p1: u32) -> Option<i8> {
        i8::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: i8, p1: u32) -> Option<i8> {
        i8::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<i8> {
        i8::try_from(p0).ok()
    }
}

pub fn checked_neg_i8(p0: i8) -> Option<i8> {
    i8::checked_neg(p0)
}

pub mod fixed_i16 {
    pub fn checked_add(p0: i16, p1: i16) -> Option<i16> {
        i16::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: i16, p1: i16) -> Option<i16> {
        i16::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: i16, p1: i16) -> Option<i16> {
        i16::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: i16, p1: i16) -> Option<i16> {
        i16::checked_div(p0, p1)
    }

    pub fn bit_and(p0: i16, p1: i16) -> i16 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: i16, p1: i16) -> i16 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: i16, p1: i16) -> i16 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: i16) -> i16 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: i16, p1: u32) -> Option<i16> {
        i16::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: i16, p1: u32) -> Option<i16> {
        i16::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<i16> {
        i16::try_from(p0).ok()
    }
}

pub fn checked_neg_i16(p0: i16) -> Option<i16> {
    i16::checked_neg(p0)
}

pub mod fixed_i32 {
    pub fn checked_add(p0: i32, p1: i32) -> Option<i32> {
        i32::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: i32, p1: i32) -> Option<i32> {
        i32::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: i32, p1: i32) -> Option<i32> {
        i32::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: i32, p1: i32) -> Option<i32> {
        i32::checked_div(p0, p1)
    }

    pub fn bit_and(p0: i32, p1: i32) -> i32 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: i32, p1: i32) -> i32 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: i32, p1: i32) -> i32 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: i32) -> i32 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: i32, p1: u32) -> Option<i32> {
        i32::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: i32, p1: u32) -> Option<i32> {
        i32::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<i32> {
        i32::try_from(p0).ok()
    }
}

pub fn checked_neg_i32(p0: i32) -> Option<i32> {
    i32::checked_neg(p0)
}

pub mod fixed_i64 {
    pub fn checked_add(p0: i64, p1: i64) -> Option<i64> {
        i64::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: i64, p1: i64) -> Option<i64> {
        i64::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: i64, p1: i64) -> Option<i64> {
        i64::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: i64, p1: i64) -> Option<i64> {
        i64::checked_div(p0, p1)
    }

    pub fn bit_and(p0: i64, p1: i64) -> i64 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: i64, p1: i64) -> i64 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: i64, p1: i64) -> i64 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: i64) -> i64 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: i64, p1: u32) -> Option<i64> {
        i64::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: i64, p1: u32) -> Option<i64> {
        i64::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<i64> {
        i64::try_from(p0).ok()
    }
}

pub fn checked_neg_i64(p0: i64) -> Option<i64> {
    i64::checked_neg(p0)
}
use core::str;

use std::mem;

use std::rc::Rc;

#[derive(Clone)]
pub struct Str(Rc<str>);

impl Str {
    pub fn lit(text: &str) -> Str { Str(Rc::from(text)) }
    pub fn text(&self) -> &str { &self.0 }
    pub fn length(&self) -> u64 { chars(&self.0) }
    pub fn utf8_encode(&self) -> Bytes { tick(self.0.len() as u64); Bytes::lit(self.0.as_bytes()) }
    pub fn split_exact(&self, delimiter: &Str, maximum: u32) -> Option<List<Str>> { if delimiter.0.is_empty() { return None; }; chars(&self.0); let mut fields: Vec<Str> = Vec::new(); for piece in self.0.split(&*delimiter.0) { fields.push(Str::lit(piece)); }; if fields.len() as u128 > u128::from(maximum) { return None; }; Some(List::onto(fields, List::nil())) }
    pub fn join(texts: List<Str>, delimiter: &Str) -> Str { let mut out = String::new(); let mut first = true; let mut cursor = &texts; while let Repr::Cell(cell) = &cursor.0 { tick(1); if !first { chars(&delimiter.0); out.push_str(&delimiter.0); }; first = false; chars(&cell.head.0); out.push_str(&cell.head.0); cursor = &cell.tail; }; match &cursor.0 { Repr::Run { buffer, len } => { for text in buffer[..*len].iter().rev() { tick(1); if !first { chars(&delimiter.0); out.push_str(&delimiter.0); }; first = false; chars(&text.0); out.push_str(&text.0); } }, _ => { }, }; Str::lit(&out) }
}

#[derive(Clone)]
pub struct Bytes(Rc<[u8]>);

impl Bytes {
    pub fn lit(octets: &[u8]) -> Bytes { Bytes(Rc::from(octets)) }
    pub fn octets(&self) -> &[u8] { &self.0 }
    pub fn append(a: Bytes, b: Bytes) -> Bytes { tick((a.0.len() + b.0.len()) as u64); let mut out = Vec::with_capacity(a.0.len() + b.0.len()); out.extend_from_slice(&a.0); out.extend_from_slice(&b.0); Bytes(Rc::from(out)) }
    pub fn length(&self) -> u64 { self.0.len() as u64 }
    pub fn index(&self, i: u64) -> Option<u8> { match usize::try_from(i) { Ok(at) => self.0.get(at).copied(), Err(_) => None, } }
    pub fn slice(&self, start: u64, count: u64) -> Option<Bytes> { let end = u128::from(start) + u128::from(count); if end > self.0.len() as u128 { return None; }; tick(count); Some(Bytes::lit(&self.0[start as usize..end as usize])) }
    pub fn utf8_decode(&self) -> Option<Str> { tick(self.0.len() as u64); match str::from_utf8(&self.0) { Ok(text) => Some(Str::lit(text)), Err(_) => None, } }
    pub fn compare(&self, other: &Bytes) -> Ordering { tick(1 + self.0.len().min(other.0.len()) as u64); self.0.cmp(&other.0) }
}

pub struct Node<T> { head: T, tail: List<T> }

pub enum Repr<T> { Nil, Run { buffer: Rc<Vec<T>>, len: usize }, Cell(Rc<Node<T>>) }

pub struct List<T>(Repr<T>);

impl<T> Clone for List<T> {
    fn clone(&self) -> Self { List(match &self.0 { Repr::Nil => Repr::Nil, Repr::Run { buffer, len } => Repr::Run { buffer: buffer.clone(), len: *len }, Repr::Cell(cell) => Repr::Cell(cell.clone()), }) }
}

impl<T> List<T> {
    fn take(&mut self) -> Repr<T> { mem::replace(&mut self.0, Repr::Nil) }
}

impl<T> Drop for Node<T> {
    fn drop(&mut self) { let mut next = match self.tail.take() { Repr::Cell(cell) => Some(cell), _ => None, }; while let Some(cell) = next { match Rc::try_unwrap(cell) { Ok(mut node) => next = match node.tail.take() { Repr::Cell(cell) => Some(cell), _ => None, }, Err(_) => break, } } }
}

impl<T: Clone> List<T> {
    pub fn nil() -> Self { List(Repr::Nil) }
    pub fn cons(head: T, mut tail: List<T>) -> Self { List(match tail.take() { Repr::Nil => { let mut buffer = Vec::with_capacity(16); buffer.push(head); Repr::Run { buffer: Rc::new(buffer), len: 1 } }, Repr::Run { mut buffer, len } => { match Rc::get_mut(&mut buffer) { Some(cells) => { cells.truncate(len); cells.push(head); Repr::Run { buffer, len: len + 1 } }, None => Repr::Cell(Rc::new(Node { head, tail: List(Repr::Run { buffer, len }) })), } }, rest => Repr::Cell(Rc::new(Node { head, tail: List(rest) })), }) }
    pub fn uncons(&self) -> Option<(T, List<T>)> { match &self.0 { Repr::Nil => None, Repr::Run { buffer, len } => { let head = buffer[len - 1].clone(); Some((head, List(if *len == 1 { Repr::Nil } else { Repr::Run { buffer: buffer.clone(), len: len - 1 } }))) }, Repr::Cell(cell) => Some((cell.head.clone(), cell.tail.clone())), } }
    pub fn length(&self) -> u64 { let mut count = 0; let mut cursor = self; while let Repr::Cell(cell) = &cursor.0 { tick(1); count += 1; cursor = &cell.tail; }; match &cursor.0 { Repr::Run { buffer, len } => { for _ in buffer[..*len].iter().rev() { tick(1); count += 1; } }, _ => { }, }; count }
    pub fn append(a: List<T>, b: List<T>) -> List<T> { List::onto(a.items(), b) }
    pub fn index(&self, i: u64) -> Option<T> { let mut position = 0; let mut cursor = self; while let Repr::Cell(cell) = &cursor.0 { tick(1); if position == i { return Some(cell.head.clone()); }; position += 1; cursor = &cell.tail; }; match &cursor.0 { Repr::Run { buffer, len } => { for item in buffer[..*len].iter().rev() { tick(1); if position == i { return Some(item.clone()); }; position += 1; } }, _ => { }, }; None }
    pub fn slice(&self, start: u64, count: u64) -> Option<List<T>> { let end = u128::from(start) + u128::from(count); let mut part = Vec::new(); let mut position: u128 = 0; let mut cursor = self; while let Repr::Cell(cell) = &cursor.0 { tick(1); if position >= end { return Some(List::onto(part, List::nil())); }; if position >= u128::from(start) { part.push(cell.head.clone()); }; position += 1; cursor = &cell.tail; }; match &cursor.0 { Repr::Run { buffer, len } => { for item in buffer[..*len].iter().rev() { tick(1); if position >= end { return Some(List::onto(part, List::nil())); }; if position >= u128::from(start) { part.push(item.clone()); }; position += 1; } }, _ => { }, }; if position < end { None } else { Some(List::onto(part, List::nil())) } }
    fn items(&self) -> Vec<T> { let mut out = Vec::new(); let mut cursor = self; while let Repr::Cell(cell) = &cursor.0 { tick(1); out.push(cell.head.clone()); cursor = &cell.tail; }; match &cursor.0 { Repr::Run { buffer, len } => { for item in buffer[..*len].iter().rev() { tick(1); out.push(item.clone()); } }, _ => { }, }; out }
    fn onto(mut items: Vec<T>, tail: List<T>) -> List<T> { let mut out = tail; while let Some(item) = items.pop() { tick(1); out = List::cons(item, out); }; out }
}

pub fn chars(text: &str) -> u64 { let mut count = 0; for _ in text.chars() { tick(1); count += 1; }; count }

impl Same for Str {
    fn same(&self, other: &Self) -> bool { let mut left = self.0.chars(); let mut right = other.0.chars(); loop { tick(1); match (left.next(), right.next()) { (None, None) => return true, (a, b) if a != b => return false, _ => { }, } } }
}

impl Same for Bytes {
    fn same(&self, other: &Self) -> bool { tick(1 + self.0.len().min(other.0.len()) as u64); self.0 == other.0 }
}

impl Key for Str {
    fn key(&self, other: &Self) -> Ordering { let mut left = self.0.chars(); let mut right = other.0.chars(); loop { tick(1); match (left.next(), right.next()) { (None, None) => return Ordering::Equal, (None, Some(_)) => return Ordering::Less, (Some(_), None) => return Ordering::Greater, (Some(a), Some(b)) => match a.cmp(&b) { Ordering::Equal => { }, decided => return decided, }, } } }
}

pub fn canonical_decimal(text: &str) -> Option<Option<i128>> { let digits = match text.strip_prefix('-') { Some(rest) => rest, None => text, }; let mut canonical = !digits.is_empty() && (digits == "0" || !digits.starts_with('0')) && text != "-0"; for c in digits.chars() { tick(1); canonical = canonical && c.is_ascii_digit(); }; if !canonical { return None; }; Some(text.parse::<i128>().ok()) }

pub fn parse_int(text: Str) -> R<Option<i64>> { match canonical_decimal(&text.0) { None => Ok(None), Some(Some(n)) => match i64::try_from(n) { Ok(value) => Ok(Some(value)), Err(_) => Err(Overflow), }, Some(None) => Err(Overflow), } }

pub fn format_u8(a: u8) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_u8(text: Str) -> Option<u8> { match canonical_decimal(&text.0) { Some(Some(n)) => u8::try_from(n).ok(), _ => None, } }

pub fn format_u16(a: u16) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_u16(text: Str) -> Option<u16> { match canonical_decimal(&text.0) { Some(Some(n)) => u16::try_from(n).ok(), _ => None, } }

pub fn format_u32(a: u32) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_u32(text: Str) -> Option<u32> { match canonical_decimal(&text.0) { Some(Some(n)) => u32::try_from(n).ok(), _ => None, } }

pub fn format_u64(a: u64) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_u64(text: Str) -> Option<u64> { match canonical_decimal(&text.0) { Some(Some(n)) => u64::try_from(n).ok(), _ => None, } }

pub fn format_i8(a: i8) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_i8(text: Str) -> Option<i8> { match canonical_decimal(&text.0) { Some(Some(n)) => i8::try_from(n).ok(), _ => None, } }

pub fn format_i16(a: i16) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_i16(text: Str) -> Option<i16> { match canonical_decimal(&text.0) { Some(Some(n)) => i16::try_from(n).ok(), _ => None, } }

pub fn format_i32(a: i32) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_i32(text: Str) -> Option<i32> { match canonical_decimal(&text.0) { Some(Some(n)) => i32::try_from(n).ok(), _ => None, } }

pub fn format_i64(a: i64) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_i64(text: Str) -> Option<i64> { match canonical_decimal(&text.0) { Some(Some(n)) => i64::try_from(n).ok(), _ => None, } }

pub fn append_list<T: Clone>(p0: List<T>, p1: List<T>) -> List<T> {
    List::append(p0, p1)
}

pub fn length_list<T: Clone>(p0: List<T>) -> u64 {
    List::length(&p0)
}

pub fn index_list<T: Clone>(p0: List<T>, p1: u64) -> Option<T> {
    List::index(&p0, p1)
}

pub fn slice_list<T: Clone>(p0: List<T>, p1: u64, p2: u64) -> Option<List<T>> {
    List::slice(&p0, p1, p2)
}

pub fn append_bytes(p0: Bytes, p1: Bytes) -> Bytes {
    Bytes::append(p0, p1)
}

pub fn length_bytes(p0: Bytes) -> u64 {
    Bytes::length(&p0)
}

pub fn length_string(p0: Str) -> u64 {
    Str::length(&p0)
}

pub fn index_bytes(p0: Bytes, p1: u64) -> Option<u8> {
    Bytes::index(&p0, p1)
}

pub fn slice_bytes(p0: Bytes, p1: u64, p2: u64) -> Option<Bytes> {
    Bytes::slice(&p0, p1, p2)
}

pub fn utf8_encode(p0: Str) -> Bytes {
    Str::utf8_encode(&p0)
}

pub fn utf8_decode(p0: Bytes) -> Option<Str> {
    Bytes::utf8_decode(&p0)
}

pub fn compare_bytes(p0: Bytes, p1: Bytes) -> Ordering {
    Bytes::compare(&p0, &p1)
}

pub fn split_exact(p0: Str, p1: Str, p2: u32) -> Option<List<Str>> {
    Str::split_exact(&p0, &p1, p2)
}

pub fn join(p0: List<Str>, p1: Str) -> Str {
    Str::join(p0, &p1)
}

#[derive(Clone)]
pub enum Adt0 {
    C0(List<(Bytes, Bytes)>, List<Adt1>, Str, List<Str>, Adt4, List<Adt5>),
}

#[derive(Clone)]
pub enum Adt1 {
    C0(Str, Str, bool, Adt2, Str, Adt3),
}

#[derive(Clone)]
pub enum Adt2 {
    C0,
    C1,
    C2,
}

#[derive(Clone)]
pub enum Adt3 {
    C0,
    C1,
    C2,
}

#[derive(Clone)]
pub enum Adt4 {
    C0,
    C1,
    C2,
    C3,
}

#[derive(Clone)]
pub enum Adt5 {
    C0(Str, Str, Str, Str),
}

#[derive(Clone)]
pub enum Adt6 {
    C0(Adt7, Str, Adt9),
}

#[derive(Clone)]
pub enum Adt7 {
    C0(Str, Adt8, Str, Str, List<Str>, List<Str>),
}

#[derive(Clone)]
pub enum Adt8 {
    C0,
    C1,
}

#[derive(Clone)]
pub enum Adt9 {
    C0,
    C1,
    C2,
    C3,
}

#[derive(Clone)]
pub enum Adt10 {
    C0(Str, List<Str>),
}

#[derive(Clone)]
pub enum Adt11 {
    C0(Str, Str, Str, Str, Str, Adt12),
}

#[derive(Clone)]
pub enum Adt12 {
    C0,
    C1,
    C2,
    C3,
}

#[derive(Clone)]
pub enum Adt13 {
    C0(u32, u32, u32, u32, u32, u32, u32, u32),
}

#[derive(Clone)]
pub enum Adt14 {
    C0(u32, u32, u32, u32, u32, u32, u32, u32, u32, u32, u32, u32, u32, u32, u32, u32),
}

#[derive(Clone)]
pub enum Adt15 {
    C0(u32, u32, u32, u32, u32, u32, u32, u32, Adt14, u64),
}

#[derive(Clone)]
pub enum Fn0 {
    F8(List<(Str, bool)>, Adt0, List<Str>),
    F154,
}

impl Fn0 {
    pub fn apply(&self, p0: List<Bytes>, p1: Adt6) -> R<List<Bytes>> {
        match self {
            Fn0::F8(k0, k1, k2) => f8(k0.clone(), k1.clone(), k2.clone(), p0, p1),
            Fn0::F154 => Ok(f154(p0, p1)),
        }
    }
}

#[derive(Clone)]
pub enum Fn1 {
    F13,
}

impl Fn1 {
    pub fn apply(&self, p0: Adt0, p1: Bytes) -> R<Adt0> {
        match self {
            Fn1::F13 => f13(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn2 {
    F17,
}

impl Fn2 {
    pub fn apply(&self, p0: List<Str>, p1: Str) -> List<Str> {
        match self {
            Fn2::F17 => f17(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn3 {
    F20(Adt10),
}

impl Fn3 {
    pub fn apply(&self, p0: List<(Str, bool)>, p1: Adt1) -> List<(Str, bool)> {
        match self {
            Fn3::F20(k0) => f20(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn4 {
    F22(List<(Str, bool)>, List<(Bytes, Bytes)>),
}

impl Fn4 {
    pub fn apply(&self, p0: (List<Adt6>, List<(List<Str>, Str)>), p1: Adt7) -> R<(List<Adt6>, List<(List<Str>, Str)>)> {
        match self {
            Fn4::F22(k0, k1) => f22(k0.clone(), k1.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn5 {
    F24,
    F107,
}

impl Fn5 {
    pub fn apply(&self, p0: List<Adt7>, p1: Adt7) -> List<Adt7> {
        match self {
            Fn5::F24 => f24(p0, p1),
            Fn5::F107 => f107(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn6 {
    F31,
    F153(Str),
}

impl Fn6 {
    pub fn apply(&self, p0: List<Bytes>, p1: Str) -> List<Bytes> {
        match self {
            Fn6::F31 => f31(p0, p1),
            Fn6::F153(k0) => f153(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn7 {
    F33(List<(Str, bool)>, List<Str>),
}

impl Fn7 {
    pub fn apply(&self, p0: Str, p1: Adt6) -> Str {
        match self {
            Fn7::F33(k0, k1) => f33(k0.clone(), k1.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn8 {
    F36(Bytes),
}

impl Fn8 {
    pub fn apply(&self, p0: (u64, (u64, List<Bytes>))) -> R<Option<(u64, (u64, List<Bytes>))>> {
        match self {
            Fn8::F36(k0) => f36(k0.clone(), p0),
        }
    }
}

#[derive(Clone)]
pub enum Fn9 {
    F39,
}

impl Fn9 {
    pub fn apply(&self, p0: List<(Bytes, Bytes)>, p1: (Bytes, Bytes)) -> List<(Bytes, Bytes)> {
        match self {
            Fn9::F39 => f39(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn10 {
    F49,
}

impl Fn10 {
    pub fn apply(&self, p0: List<Bytes>) -> Option<List<Bytes>> {
        match self {
            Fn10::F49 => f49(p0),
        }
    }
}

#[derive(Clone)]
pub enum Fn11 {
    F51,
}

impl Fn11 {
    pub fn apply(&self, p0: List<Bytes>, p1: Bytes) -> List<Bytes> {
        match self {
            Fn11::F51 => f51(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn12 {
    F62(Str),
}

impl Fn12 {
    pub fn apply(&self, p0: List<Bytes>, p1: (Str, Str)) -> List<Bytes> {
        match self {
            Fn12::F62(k0) => f62(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn13 {
    F74,
    F77,
}

impl Fn13 {
    pub fn apply(&self, p0: List<Str>, p1: Adt7) -> List<Str> {
        match self {
            Fn13::F74 => f74(p0, p1),
            Fn13::F77 => f77(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn14 {
    F88(Str),
}

impl Fn14 {
    pub fn apply(&self, p0: Adt11, p1: (Str, Adt11)) -> Adt11 {
        match self {
            Fn14::F88(k0) => f88(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn15 {
    F93(Str),
    F116(List<Adt6>),
}

impl Fn15 {
    pub fn apply(&self, p0: bool, p1: Str) -> bool {
        match self {
            Fn15::F93(k0) => f93(k0.clone(), p0, p1),
            Fn15::F116(k0) => f116(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn16 {
    F95(List<Str>, Str),
    F136(List<Str>),
}

impl Fn16 {
    pub fn apply(&self, p0: List<Bytes>, p1: (Bytes, Bytes)) -> R<List<Bytes>> {
        match self {
            Fn16::F95(k0, k1) => f95(k0.clone(), k1.clone(), p0, p1),
            Fn16::F136(k0) => f136(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn17 {
    F100(Str, Str),
}

impl Fn17 {
    pub fn apply(&self, p0: List<(Str, Str)>, p1: Adt5) -> List<(Str, Str)> {
        match self {
            Fn17::F100(k0, k1) => f100(k0.clone(), k1.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn18 {
    F102(Bytes),
}

impl Fn18 {
    pub fn apply(&self, p0: Option<Bytes>, p1: Bytes) -> Option<Bytes> {
        match self {
            Fn18::F102(k0) => f102(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn19 {
    F110(List<Str>),
}

impl Fn19 {
    pub fn apply(&self, p0: Option<Str>, p1: (List<Str>, Str)) -> Option<Str> {
        match self {
            Fn19::F110(k0) => f110(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn20 {
    F114(List<Adt6>),
}

impl Fn20 {
    pub fn apply(&self, p0: List<Adt6>, p1: Str) -> List<Adt6> {
        match self {
            Fn20::F114(k0) => f114(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn21 {
    F118,
}

impl Fn21 {
    pub fn apply(&self, p0: List<Adt9>, p1: Adt6) -> List<Adt9> {
        match self {
            Fn21::F118 => f118(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn22 {
    F122,
}

impl Fn22 {
    pub fn apply(&self, p0: (Option<Bytes>, List<Bytes>), p1: Bytes) -> (Option<Bytes>, List<Bytes>) {
        match self {
            Fn22::F122 => f122(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn23 {
    F125(Str),
}

impl Fn23 {
    pub fn apply(&self, p0: bool, p1: (Str, bool)) -> bool {
        match self {
            Fn23::F125(k0) => f125(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn24 {
    F127(Str, Adt10, Str),
}

impl Fn24 {
    pub fn apply(&self, p0: bool, p1: Adt1) -> bool {
        match self {
            Fn24::F127(k0, k1, k2) => f127(k0.clone(), k1.clone(), k2.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn25 {
    F129(Bytes, u64, Bytes, u64),
}

impl Fn25 {
    pub fn apply(&self, p0: u64) -> R<Option<u64>> {
        match self {
            Fn25::F129(k0, k1, k2, k3) => f129(k0.clone(), *k1, k2.clone(), *k3, p0),
        }
    }
}

#[derive(Clone)]
pub enum Fn26 {
    F142,
}

impl Fn26 {
    pub fn apply(&self, p0: bool, p1: Adt9) -> bool {
        match self {
            Fn26::F142 => f142(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn27 {
    F144(Str),
}

impl Fn27 {
    pub fn apply(&self, p0: Option<bool>, p1: (Str, bool)) -> Option<bool> {
        match self {
            Fn27::F144(k0) => f144(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn28 {
    F149(Bytes, u64, u64),
}

impl Fn28 {
    pub fn apply(&self, p0: (u64, Adt13)) -> R<(u64, Adt13)> {
        match self {
            Fn28::F149(k0, k1, k2) => f149(k0.clone(), *k1, *k2, p0),
        }
    }
}

#[derive(Clone)]
pub enum Fn29 {
    F152(Str),
}

impl Fn29 {
    pub fn apply(&self, p0: Option<Adt6>, p1: Adt6) -> Option<Adt6> {
        match self {
            Fn29::F152(k0) => f152(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn30 {
    F156(bool, Bytes),
}

impl Fn30 {
    pub fn apply(&self, p0: u64, p1: Str) -> R<u64> {
        match self {
            Fn30::F156(k0, k1) => f156(*k0, k1.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn31 {
    F164,
}

impl Fn31 {
    pub fn apply(&self, p0: Adt15) -> R<Adt15> {
        match self {
            Fn31::F164 => f164(p0),
        }
    }
}

#[derive(Clone)]
pub enum Fn32 {
    F182,
}

impl Fn32 {
    pub fn apply(&self, p0: (u64, (u32, u32))) -> (u64, (u32, u32)) {
        match self {
            Fn32::F182 => f182(p0),
        }
    }
}

pub fn f0(v0: Bytes) -> R<Bytes> {
    let v1: Adt0 = f1(v0)?;
    let v2: List<Str> = f2(match v1.clone() {
        Adt0::C0(_, _, _, _, h1, _) => {
            h1
        }
    });
    let v3: List<(Str, bool)> = f3(v1.clone());
    let v4: List<Adt6> = f4(f5(), match v1.clone() {
        Adt0::C0(h2, _, _, _, _, _) => {
            h2
        }
    }, v3.clone())?;
    let a5 = f6(f7(Fn0::F8(v3.clone(), v1, v2.clone()), List::<Bytes>::nil(), v4.clone())?);
    let a6 = {
        let a3 = f9(List::cons(Str::lit("sdk"), List::cons(f10(), List::<Str>::nil())));
        let a4 = f9(List::cons(Str::lit("check"), List::cons(f11(v4, v2, v3), List::<Str>::nil())));
        append_bytes(a3, a4)
    };
    Ok(append_bytes(a5, a6))
}

pub fn f1(v0: Bytes) -> R<Adt0> {
    let v1: Adt0 = f12(Fn1::F13, Adt0::C0(List::<(Bytes, Bytes)>::nil(), List::<Adt1>::nil(), Str::lit(""), List::<Str>::nil(), Adt4::C3, List::<Adt5>::nil()), f14(v0)?)?;
    Ok(Adt0::C0(f15(match v1.clone() {
        Adt0::C0(h7, _, _, _, _, _) => {
            h7
        }
    }), match v1.clone() {
        Adt0::C0(_, h8, _, _, _, _) => {
            h8
        }
    }, match v1.clone() {
        Adt0::C0(_, _, h9, _, _, _) => {
            h9
        }
    }, match v1.clone() {
        Adt0::C0(_, _, _, h10, _, _) => {
            h10
        }
    }, match v1.clone() {
        Adt0::C0(_, _, _, _, h11, _) => {
            h11
        }
    }, match v1 {
        Adt0::C0(_, _, _, _, _, h12) => {
            h12
        }
    }))
}

pub fn f2(v0: Adt4) -> List<Str> {
    f16(Fn2::F17, List::<Str>::nil(), f18(v0))
}

pub fn f3(v0: Adt0) -> List<(Str, bool)> {
    let v1: Adt10 = Adt10::C0(match v0.clone() {
        Adt0::C0(_, _, h13, _, _, _) => {
            h13
        }
    }, match v0.clone() {
        Adt0::C0(_, _, _, h14, _, _) => {
            h14
        }
    });
    f19(Fn3::F20(v1), List::<(Str, bool)>::nil(), match v0 {
        Adt0::C0(_, h15, _, _, _, _) => {
            h15
        }
    })
}

pub fn f4(v0: List<Adt7>, v1: List<(Bytes, Bytes)>, v2: List<(Str, bool)>) -> R<List<Adt6>> {
    let (h16, _) = f21(Fn4::F22(v2, v1), (List::<Adt6>::nil(), List::<(List<Str>, Str)>::nil()), v0)?;
    Ok(h16)
}

pub fn f5() -> List<Adt7> {
    f23(Fn5::F24, List::<Adt7>::nil(), f25())
}

pub fn f6(v0: List<Bytes>) -> Bytes {
    f26(f27(v0))
}

pub fn f7(v0: Fn0, p20: List<Bytes>, p21: List<Adt6>) -> R<List<Bytes>> {
    let m19 = (p20, p21);
    {
        let mut m19 = m19;
        loop {
            let step = {
                let (v1, v2) = m19;
                let m17 = v2;
                match m17.uncons() {
                    None => {
                        Err::<(List<Bytes>, List<Adt6>), R<List<Bytes>>>(Ok(v1))
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Bytes>, List<Adt6>), R<List<Bytes>>>(({
                            let c18: Fn0 = v0.clone();
                            c18.apply(v1, v3)?
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m19 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f8(v0: List<(Str, bool)>, v1: Adt0, v2: List<Str>, v3: List<Bytes>, v4: Adt6) -> R<List<Bytes>> {
    Ok(List::cons(f28(v4, v2, v1, v0)?, v3))
}

pub fn f9(v0: List<Str>) -> Bytes {
    f29(f30(Fn6::F31, List::<Bytes>::nil(), v0))
}

pub fn f10() -> Str {
    Str::lit("ghcr.io/uor-foundation/prismpm-sdk@sha256:d6c263a733a6bc36e0458c3f5b9a1f5ea9c14dfbe8c257d3f650a960b5fe633c")
}

pub fn f11(v0: List<Adt6>, v1: List<Str>, v2: List<(Str, bool)>) -> Str {
    f32(Fn7::F33(v2, v1), Str::lit("success"), v0)
}

pub fn f12(v0: Fn1, p25: Adt0, p26: List<Bytes>) -> R<Adt0> {
    let m24 = (p25, p26);
    {
        let mut m24 = m24;
        loop {
            let step = {
                let (v1, v2) = m24;
                let m22 = v2;
                match m22.uncons() {
                    None => {
                        Err::<(Adt0, List<Bytes>), R<Adt0>>(Ok(v1))
                    }
                    Some((v3, v4)) => {
                        Ok::<(Adt0, List<Bytes>), R<Adt0>>(({
                            let c23: Fn1 = v0.clone();
                            c23.apply(v1, v3)?
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m24 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f13(v0: Adt0, v1: Bytes) -> R<Adt0> {
    f34(v0, v1)
}

pub fn f14(v0: Bytes) -> R<List<Bytes>> {
    let v1: u64 = {
        let a27 = v0.clone();
        length_bytes(a27)
    };
    let v2: (u64, (u64, List<Bytes>)) = {
        let (h28, _) = f35(Fn8::F36(v0.clone()), v1, (0u64, (0u64, List::<Bytes>::nil())))?;
        h28
    };
    let v3: u64 = {
        let (h29, _) = {
            let (_, h30) = v2.clone();
            h30
        };
        h29
    };
    let v4: List<Bytes> = {
        let (_, h31) = {
            let (_, h32) = v2;
            h32
        };
        h31
    };
    let a33 = v3;
    let a34 = v1;
    if nat_lt(a33, a34) {
        Ok(f27(List::cons(f37(v0, v3, {
            let a35 = v1;
            let a36 = v3;
            nat_sub(a35, a36)
        }), v4)))
    } else {
        Ok(f27(v4))
    }
}

pub fn f15(v0: List<(Bytes, Bytes)>) -> List<(Bytes, Bytes)> {
    f38(Fn9::F39, List::<(Bytes, Bytes)>::nil(), v0)
}

pub fn f16(v0: Fn2, p40: List<Str>, p41: List<Str>) -> List<Str> {
    let m39 = (p40, p41);
    {
        let mut m39 = m39;
        loop {
            let step = {
                let (v1, v2) = m39;
                let m37 = v2;
                match m37.uncons() {
                    None => {
                        Err::<(List<Str>, List<Str>), List<Str>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Str>, List<Str>), List<Str>>(({
                            let c38: Fn2 = v0.clone();
                            c38.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m39 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f17(v0: List<Str>, v1: Str) -> List<Str> {
    if f40(v1.clone()) {
        let a42 = v0;
        let a43 = List::cons(v1, List::<Str>::nil());
        append_list(a42, a43)
    } else {
        v0
    }
}

pub fn f18(v0: Adt4) -> List<Str> {
    let m44 = v0;
    match m44 {
        Adt4::C0 => {
            let a45 = f41(f42());
            let a46 = f43(f44());
            append_list(a45, a46)
        }
        Adt4::C1 => {
            f43(f25())
        }
        Adt4::C2 => {
            f43(f25())
        }
        Adt4::C3 => {
            f43(f25())
        }
    }
}

pub fn f19(v0: Fn3, p50: List<(Str, bool)>, p51: List<Adt1>) -> List<(Str, bool)> {
    let m49 = (p50, p51);
    {
        let mut m49 = m49;
        loop {
            let step = {
                let (v1, v2) = m49;
                let m47 = v2;
                match m47.uncons() {
                    None => {
                        Err::<(List<(Str, bool)>, List<Adt1>), List<(Str, bool)>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<(Str, bool)>, List<Adt1>), List<(Str, bool)>>(({
                            let c48: Fn3 = v0.clone();
                            c48.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m49 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f20(v0: Adt10, v1: List<(Str, bool)>, v2: Adt1) -> List<(Str, bool)> {
    if f45(v2.clone(), v0) {
        List::cons((match v2.clone() {
            Adt1::C0(_, h52, _, _, _, _) => {
                h52
            }
        }, match v2 {
            Adt1::C0(_, _, h53, _, _, _) => {
                h53
            }
        }), v1)
    } else {
        v1
    }
}

pub fn f21(v0: Fn4, p57: (List<Adt6>, List<(List<Str>, Str)>), p58: List<Adt7>) -> R<(List<Adt6>, List<(List<Str>, Str)>)> {
    let m56 = (p57, p58);
    {
        let mut m56 = m56;
        loop {
            let step = {
                let (v1, v2) = m56;
                let m54 = v2;
                match m54.uncons() {
                    None => {
                        Err::<((List<Adt6>, List<(List<Str>, Str)>), List<Adt7>), R<(List<Adt6>, List<(List<Str>, Str)>)>>(Ok(v1))
                    }
                    Some((v3, v4)) => {
                        Ok::<((List<Adt6>, List<(List<Str>, Str)>), List<Adt7>), R<(List<Adt6>, List<(List<Str>, Str)>)>>(({
                            let c55: Fn4 = v0.clone();
                            c55.apply(v1, v3)?
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m56 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f22(v0: List<(Str, bool)>, v1: List<(Bytes, Bytes)>, v2: (List<Adt6>, List<(List<Str>, Str)>), v3: Adt7) -> R<(List<Adt6>, List<(List<Str>, Str)>)> {
    f46(v1, v0, v2, v3)
}

pub fn f23(v0: Fn5, p62: List<Adt7>, p63: List<Adt7>) -> List<Adt7> {
    let m61 = (p62, p63);
    {
        let mut m61 = m61;
        loop {
            let step = {
                let (v1, v2) = m61;
                let m59 = v2;
                match m59.uncons() {
                    None => {
                        Err::<(List<Adt7>, List<Adt7>), List<Adt7>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Adt7>, List<Adt7>), List<Adt7>>(({
                            let c60: Fn5 = v0.clone();
                            c60.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m61 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f24(v0: List<Adt7>, v1: Adt7) -> List<Adt7> {
    let a64 = v0;
    let a65 = List::cons(f47(v1), List::<Adt7>::nil());
    append_list(a64, a65)
}

pub fn f25() -> List<Adt7> {
    let a66 = f42();
    let a67 = f44();
    append_list(a66, a67)
}

pub fn f26(v0: List<Bytes>) -> Bytes {
    let m70 = {
        let (h68, _) = f48(Fn10::F49, {
            let a69 = v0.clone();
            length_list(a69)
        }, v0);
        h68
    };
    match m70.uncons() {
        None => {
            Bytes::lit(&[])
        }
        Some((v1, _)) => {
            v1
        }
    }
}

pub fn f27(v0: List<Bytes>) -> List<Bytes> {
    f50(Fn11::F51, List::<Bytes>::nil(), v0)
}

pub fn f28(v0: Adt6, v1: List<Str>, v2: Adt0, v3: List<(Str, bool)>) -> R<Bytes> {
    let v4: List<(Bytes, Bytes)> = match v2.clone() {
        Adt0::C0(h71, _, _, _, _, _) => {
            h71
        }
    };
    let v5: Adt7 = match v0.clone() {
        Adt6::C0(h72, _, _) => {
            h72
        }
    };
    let v6: Str = match v5.clone() {
        Adt7::C0(h73, _, _, _, _, _) => {
            h73
        }
    };
    let v7: Adt11 = f52(v6.clone());
    let v8: Bytes = {
        let a81 = {
            let a77 = f9(List::cons(Str::lit("obligation"), List::cons(v6.clone(), List::cons(f53(match v0.clone() {
                Adt6::C0(_, _, h74) => {
                    h74
                }
            }), List::cons(match v0.clone() {
                Adt6::C0(_, h75, _) => {
                    h75
                }
            }, List::<Str>::nil())))));
            let a78 = f9(List::cons(Str::lit("run"), List::cons(v6.clone(), List::cons(match v5.clone() {
                Adt7::C0(_, _, _, h76, _, _) => {
                    h76
                }
            }, List::<Str>::nil()))));
            append_bytes(a77, a78)
        };
        let a82 = f9(List::cons(Str::lit("access"), List::cons(v6.clone(), List::cons(f54(match v7.clone() {
            Adt11::C0(_, _, _, _, _, h79) => {
                h79
            }
        }), List::cons(match v7 {
            Adt11::C0(h80, _, _, _, _, _) => {
                h80
            }
        }, List::<Str>::nil())))));
        append_bytes(a81, a82)
    };
    let v9: Bytes = f29(List::cons(f55(Str::lit("sandbox")), List::cons(f55(v6.clone()), List::cons(f56(v6.clone()), List::<Bytes>::nil()))));
    let v10: bool = if f57(match v0.clone() {
        Adt6::C0(_, _, h83) => {
            h83
        }
    }) {
        f58(v6.clone(), v1.clone())
    } else {
        false
    };
    let v11: Bytes = if v10 {
        let a85 = f9(List::cons(Str::lit("establish"), List::cons(v6.clone(), List::<Str>::nil())));
        let a86 = f59(v6.clone(), match v5 {
            Adt7::C0(_, _, _, _, h84, _) => {
                h84
            }
        }, v4)?;
        append_bytes(a85, a86)
    } else {
        Bytes::lit(&[])
    };
    let v12: Bytes = if f58(v6.clone(), v1) {
        f9(List::cons(Str::lit("status"), List::cons(v6.clone(), List::cons(f60(match v0.clone() {
            Adt6::C0(_, _, h87) => {
                h87
            }
        }, match v0.clone() {
            Adt6::C0(_, h88, _) => {
                h88
            }
        }, v3), List::<Str>::nil()))))
    } else {
        Bytes::lit(&[])
    };
    let v13: Adt10 = Adt10::C0(match v2.clone() {
        Adt0::C0(_, _, h89, _, _, _) => {
            h89
        }
    }, match v2.clone() {
        Adt0::C0(_, _, _, h90, _, _) => {
            h90
        }
    });
    let v14: Bytes = f26(f61(Fn12::F62(v6.clone()), List::<Bytes>::nil(), f63(v6, match v0 {
        Adt6::C0(_, h91, _) => {
            h91
        }
    }, match v2.clone() {
        Adt0::C0(_, h92, _, _, _, _) => {
            h92
        }
    }, match v2 {
        Adt0::C0(_, _, _, _, _, h93) => {
            h93
        }
    }, v13)));
    let a100 = {
        let a98 = {
            let a96 = {
                let a94 = v8;
                let a95 = v9;
                append_bytes(a94, a95)
            };
            let a97 = v11;
            append_bytes(a96, a97)
        };
        let a99 = v12;
        append_bytes(a98, a99)
    };
    let a101 = v14;
    Ok(append_bytes(a100, a101))
}

pub fn f29(v0: List<Bytes>) -> Bytes {
    let a102 = f64(v0, Bytes::lit(&[0x20]));
    let a103 = Bytes::lit(&[0x0a]);
    append_bytes(a102, a103)
}

pub fn f30(v0: Fn6, p107: List<Bytes>, p108: List<Str>) -> List<Bytes> {
    let m106 = (p107, p108);
    {
        let mut m106 = m106;
        loop {
            let step = {
                let (v1, v2) = m106;
                let m104 = v2;
                match m104.uncons() {
                    None => {
                        Err::<(List<Bytes>, List<Str>), List<Bytes>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Bytes>, List<Str>), List<Bytes>>(({
                            let c105: Fn6 = v0.clone();
                            c105.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m106 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f31(v0: List<Bytes>, v1: Str) -> List<Bytes> {
    let a109 = v0;
    let a110 = List::cons(f55(v1), List::<Bytes>::nil());
    append_list(a109, a110)
}

pub fn f32(v0: Fn7, p114: Str, p115: List<Adt6>) -> Str {
    let m113 = (p114, p115);
    {
        let mut m113 = m113;
        loop {
            let step = {
                let (v1, v2) = m113;
                let m111 = v2;
                match m111.uncons() {
                    None => {
                        Err::<(Str, List<Adt6>), Str>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(Str, List<Adt6>), Str>(({
                            let c112: Fn7 = v0.clone();
                            c112.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m113 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f33(v0: List<(Str, bool)>, v1: List<Str>, v2: Str, v3: Adt6) -> Str {
    if f58({
        let m118 = match v3.clone() {
            Adt6::C0(h117, _, _) => {
                h117
            }
        };
        match m118 {
            Adt7::C0(h116, _, _, _, _, _) => {
                h116
            }
        }
    }, v1) {
        let v4: Str = f60(match v3.clone() {
            Adt6::C0(_, _, h119) => {
                h119
            }
        }, match v3 {
            Adt6::C0(_, h120, _) => {
                h120
            }
        }, v0);
        let a121 = v2.clone();
        let a122 = Str::lit("failure");
        if equal(a121, a122) {
            v2
        } else {
            let a123 = v4.clone();
            let a124 = Str::lit("failure");
            if equal(a123, a124) {
                v4
            } else {
                let a125 = v2.clone();
                let a126 = Str::lit("success");
                if equal(a125, a126) {
                    v4
                } else {
                    v2
                }
            }
        }
    } else {
        v2
    }
}

pub fn f34(v0: Adt0, v1: Bytes) -> R<Adt0> {
    let v2: (Bytes, Bytes) = f65(v1)?;
    let v3: Bytes = {
        let (h127, _) = v2.clone();
        h127
    };
    let v4: (Bytes, Bytes) = f65({
        let (_, h128) = v2.clone();
        h128
    })?;
    let a129 = v3.clone();
    let a130 = f55(Str::lit("tree"));
    if equal(a129, a130) {
        Ok(Adt0::C0(List::cons(({
            let (h131, _) = v4;
            h131
        }, {
            let (_, h132) = v4;
            h132
        }), match v0.clone() {
            Adt0::C0(h133, _, _, _, _, _) => {
                h133
            }
        }), match v0.clone() {
            Adt0::C0(_, h134, _, _, _, _) => {
                h134
            }
        }, match v0.clone() {
            Adt0::C0(_, _, h135, _, _, _) => {
                h135
            }
        }, match v0.clone() {
            Adt0::C0(_, _, _, h136, _, _) => {
                h136
            }
        }, match v0.clone() {
            Adt0::C0(_, _, _, _, h137, _) => {
                h137
            }
        }, match v0 {
            Adt0::C0(_, _, _, _, _, h138) => {
                h138
            }
        }))
    } else {
        let a139 = v3.clone();
        let a140 = f55(Str::lit("signed"));
        if equal(a139, a140) {
            Ok(Adt0::C0(match v0.clone() {
                Adt0::C0(h141, _, _, _, _, _) => {
                    h141
                }
            }, {
                let v5: (Bytes, Bytes) = f65({
                    let (_, h142) = v4;
                    h142
                })?;
                let v6: (Bytes, Bytes) = f65({
                    let (_, h143) = v5;
                    h143
                })?;
                let v7: (Bytes, Bytes) = f65({
                    let (_, h144) = v6;
                    h144
                })?;
                let v8: (Bytes, Bytes) = f65({
                    let (_, h145) = v7;
                    h145
                })?;
                List::cons(Adt1::C0(f66({
                    let (h146, _) = v4;
                    h146
                }), f66({
                    let (h147, _) = v5;
                    h147
                }), f67({
                    let (h148, _) = v6;
                    h148
                }), f68({
                    let (h149, _) = v7;
                    h149
                }), f66({
                    let (_, h150) = v8;
                    h150
                }), f69({
                    let (h151, _) = v8;
                    h151
                })), match v0.clone() {
                    Adt0::C0(_, h152, _, _, _, _) => {
                        h152
                    }
                })
            }, match v0.clone() {
                Adt0::C0(_, _, h153, _, _, _) => {
                    h153
                }
            }, match v0.clone() {
                Adt0::C0(_, _, _, h154, _, _) => {
                    h154
                }
            }, match v0.clone() {
                Adt0::C0(_, _, _, _, h155, _) => {
                    h155
                }
            }, match v0 {
                Adt0::C0(_, _, _, _, _, h156) => {
                    h156
                }
            }))
        } else {
            let a157 = v3.clone();
            let a158 = f55(Str::lit("trust-repository"));
            if equal(a157, a158) {
                Ok(Adt0::C0(match v0.clone() {
                    Adt0::C0(h159, _, _, _, _, _) => {
                        h159
                    }
                }, match v0.clone() {
                    Adt0::C0(_, h160, _, _, _, _) => {
                        h160
                    }
                }, f66({
                    let (_, h161) = v2;
                    h161
                }), match v0.clone() {
                    Adt0::C0(_, _, _, h162, _, _) => {
                        h162
                    }
                }, match v0.clone() {
                    Adt0::C0(_, _, _, _, h163, _) => {
                        h163
                    }
                }, match v0 {
                    Adt0::C0(_, _, _, _, _, h164) => {
                        h164
                    }
                }))
            } else {
                let a165 = v3.clone();
                let a166 = f55(Str::lit("trust-maintainer"));
                if equal(a165, a166) {
                    Ok(Adt0::C0(match v0.clone() {
                        Adt0::C0(h167, _, _, _, _, _) => {
                            h167
                        }
                    }, match v0.clone() {
                        Adt0::C0(_, h168, _, _, _, _) => {
                            h168
                        }
                    }, match v0.clone() {
                        Adt0::C0(_, _, h169, _, _, _) => {
                            h169
                        }
                    }, List::cons(f66({
                        let (_, h170) = v2;
                        h170
                    }), match v0.clone() {
                        Adt0::C0(_, _, _, h171, _, _) => {
                            h171
                        }
                    }), match v0.clone() {
                        Adt0::C0(_, _, _, _, h172, _) => {
                            h172
                        }
                    }, match v0 {
                        Adt0::C0(_, _, _, _, _, h173) => {
                            h173
                        }
                    }))
                } else {
                    let a174 = v3.clone();
                    let a175 = f55(Str::lit("event"));
                    if equal(a174, a175) {
                        Ok(Adt0::C0(match v0.clone() {
                            Adt0::C0(h176, _, _, _, _, _) => {
                                h176
                            }
                        }, match v0.clone() {
                            Adt0::C0(_, h177, _, _, _, _) => {
                                h177
                            }
                        }, match v0.clone() {
                            Adt0::C0(_, _, h178, _, _, _) => {
                                h178
                            }
                        }, match v0.clone() {
                            Adt0::C0(_, _, _, h179, _, _) => {
                                h179
                            }
                        }, f70({
                            let (_, h180) = v2;
                            h180
                        }), match v0 {
                            Adt0::C0(_, _, _, _, _, h181) => {
                                h181
                            }
                        }))
                    } else {
                        let a182 = v3;
                        let a183 = f55(Str::lit("output"));
                        if equal(a182, a183) {
                            Ok(Adt0::C0(match v0.clone() {
                                Adt0::C0(h184, _, _, _, _, _) => {
                                    h184
                                }
                            }, match v0.clone() {
                                Adt0::C0(_, h185, _, _, _, _) => {
                                    h185
                                }
                            }, match v0.clone() {
                                Adt0::C0(_, _, h186, _, _, _) => {
                                    h186
                                }
                            }, match v0.clone() {
                                Adt0::C0(_, _, _, h187, _, _) => {
                                    h187
                                }
                            }, match v0.clone() {
                                Adt0::C0(_, _, _, _, h188, _) => {
                                    h188
                                }
                            }, {
                                let v9: (Bytes, Bytes) = f65({
                                    let (_, h189) = v4;
                                    h189
                                })?;
                                let v10: (Bytes, Bytes) = f65({
                                    let (_, h190) = v9;
                                    h190
                                })?;
                                List::cons(Adt5::C0(f66({
                                    let (h191, _) = v4;
                                    h191
                                }), f66({
                                    let (h192, _) = v9;
                                    h192
                                }), f66({
                                    let (h193, _) = v10;
                                    h193
                                }), f66({
                                    let (_, h194) = v10;
                                    h194
                                })), match v0 {
                                    Adt0::C0(_, _, _, _, _, h195) => {
                                        h195
                                    }
                                })
                            }))
                        } else {
                            Ok(v0)
                        }
                    }
                }
            }
        }
    }
}

pub fn f35(v0: Fn8, p200: u64, p201: (u64, (u64, List<Bytes>))) -> R<((u64, (u64, List<Bytes>)), bool)> {
    let m199 = (p200, p201);
    {
        let mut m199 = m199;
        loop {
            let step = {
                let (v1, v2) = m199;
                let m196 = v1;
                if m196 == 0 {
                    Err::<(u64, (u64, (u64, List<Bytes>))), R<((u64, (u64, List<Bytes>)), bool)>>(Ok((v2, false)))
                } else {
                    let v3 = m196 - 1;
                    let m198 = {
                        let c197: Fn8 = v0.clone();
                        c197.apply(v2.clone())?
                    };
                    match m198 {
                        None => {
                            Err::<(u64, (u64, (u64, List<Bytes>))), R<((u64, (u64, List<Bytes>)), bool)>>(Ok((v2, true)))
                        }
                        Some(v4) => {
                            Ok::<(u64, (u64, (u64, List<Bytes>))), R<((u64, (u64, List<Bytes>)), bool)>>((v3, v4))
                        }
                    }
                }
            };
            match step {
                Ok(next) => { m199 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f36(v0: Bytes, v1: (u64, (u64, List<Bytes>))) -> R<Option<(u64, (u64, List<Bytes>))>> {
    f71(v0, v1)
}

pub fn f37(v0: Bytes, v1: u64, v2: u64) -> Bytes {
    let m205 = {
        let a202 = v0;
        let a203 = v1;
        let a204 = v2;
        slice_bytes(a202, a203, a204)
    };
    match m205 {
        None => {
            Bytes::lit(&[])
        }
        Some(v3) => {
            v3
        }
    }
}

pub fn f38(v0: Fn9, p209: List<(Bytes, Bytes)>, p210: List<(Bytes, Bytes)>) -> List<(Bytes, Bytes)> {
    let m208 = (p209, p210);
    {
        let mut m208 = m208;
        loop {
            let step = {
                let (v1, v2) = m208;
                let m206 = v2;
                match m206.uncons() {
                    None => {
                        Err::<(List<(Bytes, Bytes)>, List<(Bytes, Bytes)>), List<(Bytes, Bytes)>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<(Bytes, Bytes)>, List<(Bytes, Bytes)>), List<(Bytes, Bytes)>>(({
                            let c207: Fn9 = v0.clone();
                            c207.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m208 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f39(v0: List<(Bytes, Bytes)>, v1: (Bytes, Bytes)) -> List<(Bytes, Bytes)> {
    List::cons(v1, v0)
}

pub fn f40(v0: Str) -> bool {
    f58(v0, f72())
}

pub fn f41(v0: List<Adt7>) -> List<Str> {
    f73(Fn13::F74, List::<Str>::nil(), v0)
}

pub fn f42() -> List<Adt7> {
    f75(f76())
}

pub fn f43(v0: List<Adt7>) -> List<Str> {
    f73(Fn13::F77, List::<Str>::nil(), v0)
}

pub fn f44() -> List<Adt7> {
    f75(f78())
}

pub fn f45(v0: Adt1, v1: Adt10) -> bool {
    let m212 = match v0.clone() {
        Adt1::C0(_, _, _, h211, _, _) => {
            h211
        }
    };
    match m212 {
        Adt2::C0 => {
            let a215 = match v0 {
                Adt1::C0(_, _, _, _, h213, _) => {
                    h213
                }
            };
            let a216 = match v1 {
                Adt10::C0(h214, _) => {
                    h214
                }
            };
            equal(a215, a216)
        }
        Adt2::C1 => {
            f58(match v0 {
                Adt1::C0(_, _, _, _, h217, _) => {
                    h217
                }
            }, match v1 {
                Adt10::C0(_, h218) => {
                    h218
                }
            })
        }
        Adt2::C2 => {
            false
        }
    }
}

pub fn f46(v0: List<(Bytes, Bytes)>, v1: List<(Str, bool)>, v2: (List<Adt6>, List<(List<Str>, Str)>), v3: Adt7) -> R<(List<Adt6>, List<(List<Str>, Str)>)> {
    let v4: List<Adt6> = {
        let (h219, _) = v2;
        h219
    };
    let v5: List<(List<Str>, Str)> = {
        let (_, h220) = v2;
        h220
    };
    let v6: List<Str> = match v3.clone() {
        Adt7::C0(_, _, _, _, h221, _) => {
            h221
        }
    };
    let v8: Str = {
        let m222 = f79(v6.clone(), v5.clone());
        match m222 {
            None => {
                f80(v6.clone(), v0)?
            }
            Some(v7) => {
                v7
            }
        }
    };
    let v9: List<Adt6> = f81(match v3.clone() {
        Adt7::C0(_, _, _, _, _, h223) => {
            h223
        }
    }, v4.clone());
    let v10: Str = f82(v3.clone(), v8.clone(), v9.clone())?;
    let v11: List<Adt9> = if f83(match v3.clone() {
        Adt7::C0(_, _, _, _, _, h224) => {
            h224
        }
    }, v4.clone()) {
        f84(v9)
    } else {
        List::cons(Adt9::C3, List::<Adt9>::nil())
    };
    Ok(({
        let a226 = v4;
        let a227 = List::cons(Adt6::C0(v3.clone(), v10.clone(), f85(match v3 {
            Adt7::C0(_, h225, _, _, _, _) => {
                h225
            }
        }, v10, v1, v11)), List::<Adt6>::nil());
        append_list(a226, a227)
    }, List::cons((v6, v8), v5)))
}

pub fn f47(v0: Adt7) -> Adt7 {
    Adt7::C0(match v0.clone() {
        Adt7::C0(h228, _, _, _, _, _) => {
            h228
        }
    }, match v0.clone() {
        Adt7::C0(_, h229, _, _, _, _) => {
            h229
        }
    }, f66(f56(match v0.clone() {
        Adt7::C0(h230, _, _, _, _, _) => {
            h230
        }
    })), match v0.clone() {
        Adt7::C0(_, _, _, h231, _, _) => {
            h231
        }
    }, match v0.clone() {
        Adt7::C0(_, _, _, _, h232, _) => {
            h232
        }
    }, match v0 {
        Adt7::C0(_, _, _, _, _, h233) => {
            h233
        }
    })
}

pub fn f48(v0: Fn10, p238: u64, p239: List<Bytes>) -> (List<Bytes>, bool) {
    let m237 = (p238, p239);
    {
        let mut m237 = m237;
        loop {
            let step = {
                let (v1, v2) = m237;
                let m234 = v1;
                if m234 == 0 {
                    Err::<(u64, List<Bytes>), (List<Bytes>, bool)>((v2, false))
                } else {
                    let v3 = m234 - 1;
                    let m236 = {
                        let c235: Fn10 = v0.clone();
                        c235.apply(v2.clone())
                    };
                    match m236 {
                        None => {
                            Err::<(u64, List<Bytes>), (List<Bytes>, bool)>((v2, true))
                        }
                        Some(v4) => {
                            Ok::<(u64, List<Bytes>), (List<Bytes>, bool)>((v3, v4))
                        }
                    }
                }
            };
            match step {
                Ok(next) => { m237 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f49(v0: List<Bytes>) -> Option<List<Bytes>> {
    f86(v0)
}

pub fn f50(v0: Fn11, p243: List<Bytes>, p244: List<Bytes>) -> List<Bytes> {
    let m242 = (p243, p244);
    {
        let mut m242 = m242;
        loop {
            let step = {
                let (v1, v2) = m242;
                let m240 = v2;
                match m240.uncons() {
                    None => {
                        Err::<(List<Bytes>, List<Bytes>), List<Bytes>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Bytes>, List<Bytes>), List<Bytes>>(({
                            let c241: Fn11 = v0.clone();
                            c241.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m242 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f51(v0: List<Bytes>, v1: Bytes) -> List<Bytes> {
    List::cons(v1, v0)
}

pub fn f52(v0: Str) -> Adt11 {
    f87(Fn14::F88(v0), f89(Str::lit("@sdk"), Adt12::C0), f90())
}

pub fn f53(v0: Adt9) -> Str {
    let m245 = v0;
    match m245 {
        Adt9::C0 => {
            Str::lit("proved")
        }
        Adt9::C1 => {
            Str::lit("observe")
        }
        Adt9::C2 => {
            Str::lit("refuted")
        }
        Adt9::C3 => {
            Str::lit("blocked")
        }
    }
}

pub fn f54(v0: Adt12) -> Str {
    let m246 = v0;
    match m246 {
        Adt12::C0 => {
            Str::lit("sealed")
        }
        Adt12::C1 => {
            Str::lit("pinned")
        }
        Adt12::C2 => {
            Str::lit("daemon")
        }
        Adt12::C3 => {
            Str::lit("live")
        }
    }
}

pub fn f55(v0: Str) -> Bytes {
    let a247 = v0;
    utf8_encode(a247)
}

pub fn f56(v0: Str) -> Bytes {
    let v1: Adt11 = f52(v0);
    f64(List::cons({
        let a248 = Str::lit("prism/1");
        utf8_encode(a248)
    }, List::cons({
        let a249 = f91(v1.clone());
        utf8_encode(a249)
    }, List::cons({
        let a251 = match v1.clone() {
            Adt11::C0(_, h250, _, _, _, _) => {
                h250
            }
        };
        utf8_encode(a251)
    }, List::cons({
        let a253 = match v1.clone() {
            Adt11::C0(_, _, h252, _, _, _) => {
                h252
            }
        };
        utf8_encode(a253)
    }, List::cons({
        let a255 = match v1.clone() {
            Adt11::C0(_, _, _, h254, _, _) => {
                h254
            }
        };
        utf8_encode(a255)
    }, List::cons({
        let a257 = match v1.clone() {
            Adt11::C0(_, _, _, _, h256, _) => {
                h256
            }
        };
        utf8_encode(a257)
    }, List::cons({
        let a259 = f54(match v1 {
            Adt11::C0(_, _, _, _, _, h258) => {
                h258
            }
        });
        utf8_encode(a259)
    }, List::<Bytes>::nil()))))))), Bytes::lit(&[0x20]))
}

pub fn f57(v0: Adt9) -> bool {
    let m260 = v0;
    match m260 {
        Adt9::C0 => {
            false
        }
        Adt9::C1 => {
            true
        }
        Adt9::C2 => {
            false
        }
        Adt9::C3 => {
            false
        }
    }
}

pub fn f58(v0: Str, v1: List<Str>) -> bool {
    f92(Fn15::F93(v0), false, v1)
}

pub fn f59(v0: Str, v1: List<Str>, v2: List<(Bytes, Bytes)>) -> R<Bytes> {
    Ok(f6(f94(Fn16::F95(v1, v0), List::<Bytes>::nil(), v2)?))
}

pub fn f60(v0: Adt9, v1: Str, v2: List<(Str, bool)>) -> Str {
    if f96(v0.clone()) {
        Str::lit("success")
    } else {
        let a261 = f53(v0);
        let a262 = Str::lit("refuted");
        if if equal(a261, a262) {
            true
        } else {
            f97(v1, v2)
        } {
            Str::lit("failure")
        } else {
            Str::lit("pending")
        }
    }
}

pub fn f61(v0: Fn12, p266: List<Bytes>, p267: List<(Str, Str)>) -> List<Bytes> {
    let m265 = (p266, p267);
    {
        let mut m265 = m265;
        loop {
            let step = {
                let (v1, v2) = m265;
                let m263 = v2;
                match m263.uncons() {
                    None => {
                        Err::<(List<Bytes>, List<(Str, Str)>), List<Bytes>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Bytes>, List<(Str, Str)>), List<Bytes>>(({
                            let c264: Fn12 = v0.clone();
                            c264.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m265 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f62(v0: Str, v1: List<Bytes>, v2: (Str, Str)) -> List<Bytes> {
    let a270 = v1;
    let a271 = List::cons(f9(List::cons(Str::lit("output"), List::cons(v0, List::cons({
        let (h268, _) = v2;
        h268
    }, List::cons({
        let (_, h269) = v2;
        h269
    }, List::<Str>::nil()))))), List::<Bytes>::nil());
    append_list(a270, a271)
}

pub fn f63(v0: Str, v1: Str, v2: List<Adt1>, v3: List<Adt5>, v4: Adt10) -> List<(Str, Str)> {
    if f98(v0.clone(), v1.clone(), v2, v4) {
        f99(Fn17::F100(v1, v0), List::<(Str, Str)>::nil(), v3)
    } else {
        List::<(Str, Str)>::nil()
    }
}

pub fn f64(v0: List<Bytes>, v1: Bytes) -> Bytes {
    let m272 = f101(Fn18::F102(v1), None::<Bytes>, v0);
    match m272 {
        None => {
            Bytes::lit(&[])
        }
        Some(v2) => {
            v2
        }
    }
}

pub fn f65(v0: Bytes) -> R<(Bytes, Bytes)> {
    let m273 = f103(v0.clone(), Bytes::lit(&[0x20]))?;
    match m273 {
        None => {
            Ok((v0, Bytes::lit(&[])))
        }
        Some(v1) => {
            Ok((f37(v0.clone(), 0u64, v1), f37(v0.clone(), {
                let a274 = v1;
                let a275 = 1u64;
                nat_add(a274, a275)?
            }, {
                let a279 = {
                    let a276 = v0;
                    length_bytes(a276)
                };
                let a280 = {
                    let a277 = v1;
                    let a278 = 1u64;
                    nat_add(a277, a278)?
                };
                nat_sub(a279, a280)
            })))
        }
    }
}

pub fn f66(v0: Bytes) -> Str {
    let m282 = {
        let a281 = v0;
        utf8_decode(a281)
    };
    match m282 {
        None => {
            Str::lit("")
        }
        Some(v1) => {
            v1
        }
    }
}

pub fn f67(v0: Bytes) -> bool {
    let a283 = v0;
    let a284 = f55(Str::lit("pass"));
    equal(a283, a284)
}

pub fn f68(v0: Bytes) -> Adt2 {
    let a285 = v0.clone();
    let a286 = f55(Str::lit("workflow"));
    if equal(a285, a286) {
        Adt2::C0
    } else {
        let a287 = v0;
        let a288 = f55(Str::lit("maintainer"));
        if equal(a287, a288) {
            Adt2::C1
        } else {
            Adt2::C2
        }
    }
}

pub fn f69(v0: Bytes) -> Adt3 {
    let a289 = v0.clone();
    let a290 = f55(Str::lit("workstation"));
    if equal(a289, a290) {
        Adt3::C1
    } else {
        let a291 = v0;
        let a292 = f55(Str::lit("browser"));
        if equal(a291, a292) {
            Adt3::C2
        } else {
            Adt3::C0
        }
    }
}

pub fn f70(v0: Bytes) -> Adt4 {
    let a293 = v0.clone();
    let a294 = f55(Str::lit("pull_request"));
    if equal(a293, a294) {
        Adt4::C0
    } else {
        let a295 = v0.clone();
        let a296 = f55(Str::lit("push"));
        if equal(a295, a296) {
            Adt4::C1
        } else {
            let a297 = v0;
            let a298 = f55(Str::lit("tag"));
            if equal(a297, a298) {
                Adt4::C2
            } else {
                Adt4::C3
            }
        }
    }
}

pub fn f71(v0: Bytes, v1: (u64, (u64, List<Bytes>))) -> R<Option<(u64, (u64, List<Bytes>))>> {
    let v2: u64 = {
        let (h299, _) = v1.clone();
        h299
    };
    let v3: u64 = {
        let (h300, _) = {
            let (_, h301) = v1.clone();
            h301
        };
        h300
    };
    let v4: List<Bytes> = {
        let (_, h302) = {
            let (_, h303) = v1;
            h303
        };
        h302
    };
    let m304 = f104(v0.clone(), v2);
    match m304 {
        None => {
            Ok(None::<(u64, (u64, List<Bytes>))>)
        }
        Some(v5) => {
            let a305 = v5;
            let a306 = 10u8;
            if equal(a305, a306) {
                Ok(Some(({
                    let a307 = v2;
                    let a308 = 1u64;
                    nat_add(a307, a308)?
                }, ({
                    let a309 = v2;
                    let a310 = 1u64;
                    nat_add(a309, a310)?
                }, List::cons(f105(f37(v0, v3, {
                    let a311 = v2;
                    let a312 = v3;
                    nat_sub(a311, a312)
                })), v4)))))
            } else {
                Ok(Some(({
                    let a313 = v2;
                    let a314 = 1u64;
                    nat_add(a313, a314)?
                }, (v3, v4))))
            }
        }
    }
}

pub fn f72() -> List<Str> {
    List::cons(Str::lit("factory-model"), List::cons(Str::lit("lint"), List::cons(Str::lit("model-audits"), List::cons(Str::lit("fixtures-golden"), List::<Str>::nil()))))
}

pub fn f73(v0: Fn13, p318: List<Str>, p319: List<Adt7>) -> List<Str> {
    let m317 = (p318, p319);
    {
        let mut m317 = m317;
        loop {
            let step = {
                let (v1, v2) = m317;
                let m315 = v2;
                match m315.uncons() {
                    None => {
                        Err::<(List<Str>, List<Adt7>), List<Str>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Str>, List<Adt7>), List<Str>>(({
                            let c316: Fn13 = v0.clone();
                            c316.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m317 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f74(v0: List<Str>, v1: Adt7) -> List<Str> {
    if f106(v1.clone()) {
        let a321 = v0;
        let a322 = List::cons(match v1 {
            Adt7::C0(h320, _, _, _, _, _) => {
                h320
            }
        }, List::<Str>::nil());
        append_list(a321, a322)
    } else {
        v0
    }
}

pub fn f75(v0: List<Adt7>) -> List<Adt7> {
    f23(Fn5::F107, List::<Adt7>::nil(), v0)
}

pub fn f76() -> List<Adt7> {
    List::cons(f108(Str::lit("policy"), Adt8::C0, Str::lit("actions"), Str::lit("release.yml/policy"), List::cons(Str::lit(".github/workflows/release.yml"), List::cons(Str::lit("Cargo.toml"), List::cons(Str::lit("model/errors.toml"), List::cons(Str::lit("scripts/"), List::cons(Str::lit("@mode"), List::cons(Str::lit("@run"), List::<Str>::nil())))))), List::<Str>::nil()), List::cons(f108(Str::lit("factory-model"), Adt8::C0, Str::lit("host"), Str::lit("bash prism-factory/check.sh"), List::cons(Str::lit(".github/workflows/factory.yml"), List::cons(Str::lit(".github/workflows/prism-delegation.yml"), List::cons(Str::lit(".github/workflows/release-cut.yml"), List::cons(Str::lit(".github/workflows/release.yml"), List::cons(Str::lit("prism-factory/"), List::cons(Str::lit("vendor/lexlean/"), List::<Str>::nil())))))), List::<Str>::nil()), List::cons(f108(Str::lit("plumbing"), Adt8::C0, Str::lit("actions"), Str::lit("release.yml/devcontainer-image"), List::cons(Str::lit(""), List::cons(Str::lit("@run"), List::<Str>::nil())), List::cons(Str::lit("policy"), List::<Str>::nil())), List::cons(f108(Str::lit("vv-sdk"), Adt8::C1, Str::lit("actions"), Str::lit("release.yml/vv-sdk"), List::cons(Str::lit(""), List::cons(Str::lit("!.github/workflows/release-cut.yml"), List::cons(Str::lit("!.github/workflows/release-qualify.yml"), List::cons(Str::lit("!.github/workflows/release.yml"), List::cons(Str::lit("!factory/"), List::cons(Str::lit("!scripts/browser-api-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/ci-capacity.test.mjs"), List::cons(Str::lit("!scripts/factory.mjs"), List::cons(Str::lit("!scripts/factory.test.mjs"), List::cons(Str::lit("!scripts/lexlean-pin.test.mjs"), List::cons(Str::lit("!scripts/library-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/product-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/release-gate-evidence.mjs"), List::cons(Str::lit("!scripts/release-gate-evidence.test.mjs"), List::cons(Str::lit("!scripts/release-native-contract.test.mjs"), List::cons(Str::lit("!scripts/release-phases.md"), List::cons(Str::lit("!scripts/release-phases.mjs"), List::cons(Str::lit("!scripts/release-phases.test.mjs"), List::cons(Str::lit("!scripts/release-publication.mjs"), List::cons(Str::lit("!scripts/release-publication.test.mjs"), List::cons(Str::lit("!scripts/release-rebuild.sh"), List::cons(Str::lit("!scripts/rust-oracle-tools-inputs.test.mjs"), List::cons(Str::lit("!scripts/sdk-candidate-sbom.test.mjs"), List::cons(Str::lit("!scripts/sdk-construction-handoff.test.mjs"), List::cons(Str::lit("!scripts/sdk-image-inputs.test.mjs"), List::cons(Str::lit("!scripts/sdk-release-evidence.mjs"), List::cons(Str::lit("!scripts/sdk-release-evidence.test.mjs"), List::cons(Str::lit("!scripts/sdk-vv-check.test.mjs"), List::cons(Str::lit("!scripts/unpublished-sdk-qualification.test.mjs"), List::cons(Str::lit("!prism-factory/"), List::cons(Str::lit("prism-factory/jobs/header.yml"), List::cons(Str::lit("prism-factory/jobs/vv-sdk.yml"), List::<Str>::nil())))))))))))))))))))))))))))))))), List::<Str>::nil()), List::cons(f108(Str::lit("source-vv"), Adt8::C1, Str::lit("actions"), Str::lit("release.yml/source-vv"), List::cons(Str::lit(""), List::cons(Str::lit("!.github/workflows/release-cut.yml"), List::cons(Str::lit("!.github/workflows/release-qualify.yml"), List::cons(Str::lit("!.github/workflows/release.yml"), List::cons(Str::lit("!factory/"), List::cons(Str::lit("!scripts/browser-api-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/ci-capacity.test.mjs"), List::cons(Str::lit("!scripts/factory.mjs"), List::cons(Str::lit("!scripts/factory.test.mjs"), List::cons(Str::lit("!scripts/lexlean-pin.test.mjs"), List::cons(Str::lit("!scripts/library-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/product-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/release-gate-evidence.mjs"), List::cons(Str::lit("!scripts/release-gate-evidence.test.mjs"), List::cons(Str::lit("!scripts/release-native-contract.test.mjs"), List::cons(Str::lit("!scripts/release-phases.md"), List::cons(Str::lit("!scripts/release-phases.mjs"), List::cons(Str::lit("!scripts/release-phases.test.mjs"), List::cons(Str::lit("!scripts/release-publication.mjs"), List::cons(Str::lit("!scripts/release-publication.test.mjs"), List::cons(Str::lit("!scripts/release-rebuild.sh"), List::cons(Str::lit("!scripts/rust-oracle-tools-inputs.test.mjs"), List::cons(Str::lit("!scripts/sdk-candidate-sbom.test.mjs"), List::cons(Str::lit("!scripts/sdk-construction-handoff.test.mjs"), List::cons(Str::lit("!scripts/sdk-image-inputs.test.mjs"), List::cons(Str::lit("!scripts/sdk-release-evidence.mjs"), List::cons(Str::lit("!scripts/sdk-release-evidence.test.mjs"), List::cons(Str::lit("!scripts/sdk-vv-check.test.mjs"), List::cons(Str::lit("!scripts/unpublished-sdk-qualification.test.mjs"), List::cons(Str::lit("!prism-factory/"), List::cons(Str::lit("prism-factory/jobs/header.yml"), List::cons(Str::lit("prism-factory/jobs/source-vv.yml"), List::<Str>::nil())))))))))))))))))))))))))))))))), List::cons(Str::lit("vv-sdk"), List::<Str>::nil())), List::cons(f108(Str::lit("build"), Adt8::C1, Str::lit("actions"), Str::lit("release.yml/build"), List::cons(Str::lit(""), List::cons(Str::lit("!.github/workflows/release-cut.yml"), List::cons(Str::lit("!.github/workflows/release-qualify.yml"), List::cons(Str::lit("!.github/workflows/release.yml"), List::cons(Str::lit("!factory/"), List::cons(Str::lit("!scripts/browser-api-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/ci-capacity.test.mjs"), List::cons(Str::lit("!scripts/factory.mjs"), List::cons(Str::lit("!scripts/factory.test.mjs"), List::cons(Str::lit("!scripts/lexlean-pin.test.mjs"), List::cons(Str::lit("!scripts/library-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/product-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/release-gate-evidence.test.mjs"), List::cons(Str::lit("!scripts/release-native-contract.test.mjs"), List::cons(Str::lit("!scripts/release-phases.md"), List::cons(Str::lit("!scripts/release-phases.test.mjs"), List::cons(Str::lit("!scripts/release-publication.mjs"), List::cons(Str::lit("!scripts/release-publication.test.mjs"), List::cons(Str::lit("!scripts/rust-oracle-tools-inputs.test.mjs"), List::cons(Str::lit("!scripts/sdk-candidate-sbom.test.mjs"), List::cons(Str::lit("!scripts/sdk-construction-handoff.test.mjs"), List::cons(Str::lit("!scripts/sdk-image-inputs.test.mjs"), List::cons(Str::lit("!scripts/sdk-release-evidence.mjs"), List::cons(Str::lit("!scripts/sdk-release-evidence.test.mjs"), List::cons(Str::lit("!scripts/sdk-vv-check.test.mjs"), List::cons(Str::lit("!scripts/unpublished-sdk-qualification.test.mjs"), List::cons(Str::lit("!prism-factory/"), List::cons(Str::lit("scripts/release-gate-evidence.mjs"), List::cons(Str::lit("scripts/release-phases.mjs"), List::cons(Str::lit("scripts/release-rebuild.sh"), List::cons(Str::lit("prism-factory/jobs/header.yml"), List::cons(Str::lit("prism-factory/jobs/image-platforms.yml"), List::cons(Str::lit("prism-factory/jobs/images.yml"), List::cons(Str::lit("prism-factory/jobs/reproducibility.yml"), List::cons(Str::lit("prism-factory/jobs/native.yml"), List::cons(Str::lit("prism-factory/jobs/installed-sdk.yml"), List::<Str>::nil())))))))))))))))))))))))))))))))))))), List::<Str>::nil()), List::cons(f108(Str::lit("gate"), Adt8::C0, Str::lit("actions"), Str::lit("release.yml/gate"), List::cons(Str::lit(""), List::cons(Str::lit("@run"), List::<Str>::nil())), List::cons(Str::lit("plumbing"), List::cons(Str::lit("source-vv"), List::<Str>::nil()))), List::cons(f108(Str::lit("oci-native"), Adt8::C1, Str::lit("actions"), Str::lit("release.yml/oci-native"), List::cons(Str::lit(""), List::cons(Str::lit("@mode"), List::cons(Str::lit("@run"), List::<Str>::nil()))), List::cons(Str::lit("gate"), List::cons(Str::lit("build"), List::<Str>::nil()))), List::cons(f108(Str::lit("crates"), Adt8::C1, Str::lit("actions"), Str::lit("release.yml/crates"), List::cons(Str::lit(""), List::cons(Str::lit("@mode"), List::cons(Str::lit("@run"), List::<Str>::nil()))), List::cons(Str::lit("oci-native"), List::<Str>::nil())), List::cons(f108(Str::lit("release"), Adt8::C1, Str::lit("actions"), Str::lit("release.yml/release"), List::cons(Str::lit(""), List::cons(Str::lit("@mode"), List::cons(Str::lit("@run"), List::<Str>::nil()))), List::cons(Str::lit("factory-model"), List::cons(Str::lit("crates"), List::<Str>::nil()))), List::<Adt7>::nil()))))))))))
}

pub fn f77(v0: List<Str>, v1: Adt7) -> List<Str> {
    let a324 = v0;
    let a325 = List::cons(match v1 {
        Adt7::C0(h323, _, _, _, _, _) => {
            h323
        }
    }, List::<Str>::nil());
    append_list(a324, a325)
}

pub fn f78() -> List<Adt7> {
    List::cons(f108(Str::lit("lint"), Adt8::C1, Str::lit("prism"), Str::lit("cargo fetch --locked && cargo fmt --check && cargo clippy --workspace --all-targets --all-features --locked --offline -- -D warnings && cargo deny fetch && cargo deny --frozen --all-features check"), List::cons(Str::lit(""), List::<Str>::nil()), List::<Str>::nil()), List::cons(f108(Str::lit("model-audits"), Adt8::C1, Str::lit("prism"), Str::lit("bash scripts/fetch.sh && cargo xtask validate"), List::cons(Str::lit(""), List::cons(Str::lit("@base:model/modules.toml"), List::<Str>::nil())), List::<Str>::nil()), List::cons(f108(Str::lit("fixtures-golden"), Adt8::C1, Str::lit("prism"), Str::lit("cargo fetch --locked && bash scripts/fetch-oracle-cargo.sh && cargo xtask check-fixtures && cargo run --locked --offline --manifest-path tests/holo-codec-oracle/Cargo.toml --target-dir target/holo-codec-oracle && cargo xtask check-golden"), List::cons(Str::lit(""), List::<Str>::nil()), List::<Str>::nil()), List::<Adt7>::nil())))
}

pub fn f79(v0: List<Str>, v1: List<(List<Str>, Str)>) -> Option<Str> {
    f109(Fn19::F110(v0), None::<Str>, v1)
}

pub fn f80(v0: List<Str>, v1: List<(Bytes, Bytes)>) -> R<Str> {
    Ok(f66(f111(f112(v0, v1)?)?))
}

pub fn f81(v0: List<Str>, v1: List<Adt6>) -> List<Adt6> {
    f113(Fn20::F114(v1), List::<Adt6>::nil(), v0)
}

pub fn f82(v0: Adt7, v1: Str, v2: List<Adt6>) -> R<Str> {
    Ok(f66(f111(f115(v0, v1, v2)?)?))
}

pub fn f83(v0: List<Str>, v1: List<Adt6>) -> bool {
    f92(Fn15::F116(v1), true, v0)
}

pub fn f84(v0: List<Adt6>) -> List<Adt9> {
    f117(Fn21::F118, List::<Adt9>::nil(), v0)
}

pub fn f85(v0: Adt8, v1: Str, v2: List<(Str, bool)>, v3: List<Adt9>) -> Adt9 {
    if f119(v3) {
        let m326 = f120(v1, v2);
        match m326 {
            None => {
                Adt9::C1
            }
            Some(v4) => {
                if v4 {
                    Adt9::C0
                } else {
                    let m327 = v0;
                    match m327 {
                        Adt8::C0 => {
                            Adt9::C2
                        }
                        Adt8::C1 => {
                            Adt9::C1
                        }
                    }
                }
            }
        }
    } else {
        Adt9::C3
    }
}

pub fn f86(v0: List<Bytes>) -> Option<List<Bytes>> {
    let m328 = v0.clone();
    match m328.uncons() {
        None => {
            None::<List<Bytes>>
        }
        Some((_, v2)) => {
            let m329 = v2;
            match m329.uncons() {
                None => {
                    None::<List<Bytes>>
                }
                Some((_, _)) => {
                    let v5: (Option<Bytes>, List<Bytes>) = f121(Fn22::F122, (None::<Bytes>, List::<Bytes>::nil()), v0);
                    let m331 = {
                        let (h330, _) = v5;
                        h330
                    };
                    match m331 {
                        None => {
                            Some(f27({
                                let (_, h333) = v5;
                                h333
                            }))
                        }
                        Some(v6) => {
                            Some(f27(List::cons(v6, {
                                let (_, h332) = v5;
                                h332
                            })))
                        }
                    }
                }
            }
        }
    }
}

pub fn f87(v0: Fn14, p337: Adt11, p338: List<(Str, Adt11)>) -> Adt11 {
    let m336 = (p337, p338);
    {
        let mut m336 = m336;
        loop {
            let step = {
                let (v1, v2) = m336;
                let m334 = v2;
                match m334.uncons() {
                    None => {
                        Err::<(Adt11, List<(Str, Adt11)>), Adt11>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(Adt11, List<(Str, Adt11)>), Adt11>(({
                            let c335: Fn14 = v0.clone();
                            c335.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m336 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f88(v0: Str, v1: Adt11, v2: (Str, Adt11)) -> Adt11 {
    let a340 = {
        let (h339, _) = v2;
        h339
    };
    let a341 = v0;
    if equal(a340, a341) {
        let (_, h342) = v2;
        h342
    } else {
        v1
    }
}

pub fn f89(v0: Str, v1: Adt12) -> Adt11 {
    Adt11::C0(v0, Str::lit("1000:1000"), Str::lit("0022"), Str::lit("tmp/prismpm-home"), Str::lit("tmp"), v1)
}

pub fn f90() -> List<(Str, Adt11)> {
    List::cons((Str::lit("policy"), f89(Str::lit("@sdk"), Adt12::C0)), List::cons((Str::lit("factory-model"), f89(Str::lit("@sdk"), Adt12::C1)), List::cons((Str::lit("plumbing"), f89(Str::lit("@sdk"), Adt12::C1)), List::cons((Str::lit("vv-sdk"), f89(Str::lit("@sdk"), Adt12::C1)), List::cons((Str::lit("source-vv"), f89(Str::lit("@vv-sdk"), Adt12::C0)), List::cons((Str::lit("build"), f89(Str::lit("@sdk"), Adt12::C1)), List::cons((Str::lit("gate"), f89(Str::lit("@vv-sdk"), Adt12::C0)), List::cons((Str::lit("oci-native"), f89(Str::lit("@build"), Adt12::C1)), List::cons((Str::lit("crates"), f89(Str::lit("@build"), Adt12::C1)), List::cons((Str::lit("release"), f89(Str::lit("@build"), Adt12::C1)), List::cons((Str::lit("lint"), f89(Str::lit("@sdk"), Adt12::C1)), List::cons((Str::lit("model-audits"), f89(Str::lit("@sdk"), Adt12::C2)), List::cons((Str::lit("fixtures-golden"), f89(Str::lit("@sdk"), Adt12::C1)), List::<(Str, Adt11)>::nil())))))))))))))
}

pub fn f91(v0: Adt11) -> Str {
    let a344 = match v0.clone() {
        Adt11::C0(h343, _, _, _, _, _) => {
            h343
        }
    };
    let a345 = Str::lit("@sdk");
    if equal(a344, a345) {
        f10()
    } else {
        match v0 {
            Adt11::C0(h346, _, _, _, _, _) => {
                h346
            }
        }
    }
}

pub fn f92(v0: Fn15, p350: bool, p351: List<Str>) -> bool {
    let m349 = (p350, p351);
    {
        let mut m349 = m349;
        loop {
            let step = {
                let (v1, v2) = m349;
                let m347 = v2;
                match m347.uncons() {
                    None => {
                        Err::<(bool, List<Str>), bool>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(bool, List<Str>), bool>(({
                            let c348: Fn15 = v0.clone();
                            c348.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m349 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f93(v0: Str, v1: bool, v2: Str) -> bool {
    if v1 {
        true
    } else {
        let a352 = v2;
        let a353 = v0;
        equal(a352, a353)
    }
}

pub fn f94(v0: Fn16, p357: List<Bytes>, p358: List<(Bytes, Bytes)>) -> R<List<Bytes>> {
    let m356 = (p357, p358);
    {
        let mut m356 = m356;
        loop {
            let step = {
                let (v1, v2) = m356;
                let m354 = v2;
                match m354.uncons() {
                    None => {
                        Err::<(List<Bytes>, List<(Bytes, Bytes)>), R<List<Bytes>>>(Ok(v1))
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Bytes>, List<(Bytes, Bytes)>), R<List<Bytes>>>(({
                            let c355: Fn16 = v0.clone();
                            c355.apply(v1, v3)?
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m356 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f95(v0: List<Str>, v1: Str, v2: List<Bytes>, v3: (Bytes, Bytes)) -> R<List<Bytes>> {
    if f123(v0, {
        let (_, h359) = v3.clone();
        h359
    })? {
        Ok(List::cons(f29(List::cons(f55(Str::lit("file")), List::cons(f55(v1), List::cons({
            let (_, h360) = v3;
            h360
        }, List::<Bytes>::nil())))), v2))
    } else {
        Ok(v2)
    }
}

pub fn f96(v0: Adt9) -> bool {
    let m361 = v0;
    match m361 {
        Adt9::C0 => {
            true
        }
        Adt9::C1 => {
            false
        }
        Adt9::C2 => {
            false
        }
        Adt9::C3 => {
            false
        }
    }
}

pub fn f97(v0: Str, v1: List<(Str, bool)>) -> bool {
    f124(Fn23::F125(v0), false, v1)
}

pub fn f98(v0: Str, v1: Str, v2: List<Adt1>, v3: Adt10) -> bool {
    f126(Fn24::F127(v1, v3, v0), false, v2)
}

pub fn f99(v0: Fn17, p365: List<(Str, Str)>, p366: List<Adt5>) -> List<(Str, Str)> {
    let m364 = (p365, p366);
    {
        let mut m364 = m364;
        loop {
            let step = {
                let (v1, v2) = m364;
                let m362 = v2;
                match m362.uncons() {
                    None => {
                        Err::<(List<(Str, Str)>, List<Adt5>), List<(Str, Str)>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<(Str, Str)>, List<Adt5>), List<(Str, Str)>>(({
                            let c363: Fn17 = v0.clone();
                            c363.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m364 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f100(v0: Str, v1: Str, v2: List<(Str, Str)>, v3: Adt5) -> List<(Str, Str)> {
    let a368 = match v3.clone() {
        Adt5::C0(h367, _, _, _) => {
            h367
        }
    };
    let a369 = v1;
    if if equal(a368, a369) {
        let a371 = match v3.clone() {
            Adt5::C0(_, h370, _, _) => {
                h370
            }
        };
        let a372 = v0;
        equal(a371, a372)
    } else {
        false
    } {
        let a375 = v2;
        let a376 = List::cons((match v3.clone() {
            Adt5::C0(_, _, h373, _) => {
                h373
            }
        }, match v3 {
            Adt5::C0(_, _, _, h374) => {
                h374
            }
        }), List::<(Str, Str)>::nil());
        append_list(a375, a376)
    } else {
        v2
    }
}

pub fn f101(v0: Fn18, p380: Option<Bytes>, p381: List<Bytes>) -> Option<Bytes> {
    let m379 = (p380, p381);
    {
        let mut m379 = m379;
        loop {
            let step = {
                let (v1, v2) = m379;
                let m377 = v2;
                match m377.uncons() {
                    None => {
                        Err::<(Option<Bytes>, List<Bytes>), Option<Bytes>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(Option<Bytes>, List<Bytes>), Option<Bytes>>(({
                            let c378: Fn18 = v0.clone();
                            c378.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m379 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f102(v0: Bytes, v1: Option<Bytes>, v2: Bytes) -> Option<Bytes> {
    let m382 = v1;
    match m382 {
        None => {
            Some(v2)
        }
        Some(v3) => {
            Some({
                let a385 = {
                    let a383 = v3;
                    let a384 = v0;
                    append_bytes(a383, a384)
                };
                let a386 = v2;
                append_bytes(a385, a386)
            })
        }
    }
}

pub fn f103(v0: Bytes, v1: Bytes) -> R<Option<u64>> {
    let v2: u64 = {
        let a387 = v0.clone();
        length_bytes(a387)
    };
    let v3: u64 = {
        let a388 = v1.clone();
        length_bytes(a388)
    };
    let v4: u64 = {
        let (h389, _) = f128(Fn25::F129(v1.clone(), v3, v0.clone(), v2), {
            let a390 = v2;
            let a391 = 1u64;
            nat_add(a390, a391)?
        }, 0u64)?;
        h389
    };
    if f130(v0, v1, v4) {
        Ok(Some(v4))
    } else {
        Ok(None::<u64>)
    }
}

pub fn f104(v0: Bytes, v1: u64) -> Option<u8> {
    let a392 = v0;
    let a393 = v1;
    index_bytes(a392, a393)
}

pub fn f105(v0: Bytes) -> Bytes {
    if f131(v0.clone(), Bytes::lit(&[0x0d])) {
        f37(v0.clone(), 0u64, {
            let a395 = {
                let a394 = v0;
                length_bytes(a394)
            };
            let a396 = 1u64;
            nat_sub(a395, a396)
        })
    } else {
        v0
    }
}

pub fn f106(v0: Adt7) -> bool {
    let a398 = f58(Str::lit("@mode"), match v0.clone() {
        Adt7::C0(_, _, _, _, h397, _) => {
            h397
        }
    });
    if bool_not(a398) {
        let a400 = f58(Str::lit("@run"), match v0 {
            Adt7::C0(_, _, _, _, h399, _) => {
                h399
            }
        });
        bool_not(a400)
    } else {
        false
    }
}

pub fn f107(v0: List<Adt7>, v1: Adt7) -> List<Adt7> {
    let a401 = v0;
    let a402 = List::cons(f132(v1), List::<Adt7>::nil());
    append_list(a401, a402)
}

pub fn f108(v0: Str, v1: Adt8, v2: Str, v3: Str, v4: List<Str>, v5: List<Str>) -> Adt7 {
    Adt7::C0(v0, v1, v2, v3, v4, v5)
}

pub fn f109(v0: Fn19, p406: Option<Str>, p407: List<(List<Str>, Str)>) -> Option<Str> {
    let m405 = (p406, p407);
    {
        let mut m405 = m405;
        loop {
            let step = {
                let (v1, v2) = m405;
                let m403 = v2;
                match m403.uncons() {
                    None => {
                        Err::<(Option<Str>, List<(List<Str>, Str)>), Option<Str>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(Option<Str>, List<(List<Str>, Str)>), Option<Str>>(({
                            let c404: Fn19 = v0.clone();
                            c404.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m405 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f110(v0: List<Str>, v1: Option<Str>, v2: (List<Str>, Str)) -> Option<Str> {
    if f133({
        let (h408, _) = v2;
        h408
    }, v0) {
        Some({
            let (_, h409) = v2;
            h409
        })
    } else {
        v1
    }
}

pub fn f111(v0: Bytes) -> R<Bytes> {
    Ok(f134(f135(v0)?))
}

pub fn f112(v0: List<Str>, v1: List<(Bytes, Bytes)>) -> R<Bytes> {
    Ok(f6(f94(Fn16::F136(v0), List::<Bytes>::nil(), v1)?))
}

pub fn f113(v0: Fn20, p413: List<Adt6>, p414: List<Str>) -> List<Adt6> {
    let m412 = (p413, p414);
    {
        let mut m412 = m412;
        loop {
            let step = {
                let (v1, v2) = m412;
                let m410 = v2;
                match m410.uncons() {
                    None => {
                        Err::<(List<Adt6>, List<Str>), List<Adt6>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Adt6>, List<Str>), List<Adt6>>(({
                            let c411: Fn20 = v0.clone();
                            c411.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m412 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f114(v0: List<Adt6>, v1: List<Adt6>, v2: Str) -> List<Adt6> {
    let m415 = f137(v2, v0);
    match m415 {
        None => {
            v1
        }
        Some(v3) => {
            let a416 = v1;
            let a417 = List::cons(v3, List::<Adt6>::nil());
            append_list(a416, a417)
        }
    }
}

pub fn f115(v0: Adt7, v1: Str, v2: List<Adt6>) -> R<Bytes> {
    Ok(f26(List::cons(f29(List::cons(f55(Str::lit("prism-factory/obligation/1")), List::<Bytes>::nil())), List::cons(f29(List::cons(f55(Str::lit("name")), List::cons(f55(match v0.clone() {
        Adt7::C0(h418, _, _, _, _, _) => {
            h418
        }
    }), List::<Bytes>::nil()))), List::cons(f29(List::cons(f55(Str::lit("kind")), List::cons(f55(f138(match v0.clone() {
        Adt7::C0(_, h419, _, _, _, _) => {
            h419
        }
    })), List::<Bytes>::nil()))), List::cons(f29(List::cons(f55(Str::lit("environment")), List::cons(f55(match v0.clone() {
        Adt7::C0(_, _, h420, _, _, _) => {
            h420
        }
    }), List::<Bytes>::nil()))), List::cons(f29(List::cons(f55(Str::lit("run")), List::cons(f55(match v0.clone() {
        Adt7::C0(_, _, _, h421, _, _) => {
            h421
        }
    }), List::<Bytes>::nil()))), List::cons(f139(Str::lit("input"), match v0 {
        Adt7::C0(_, _, _, _, h422, _) => {
            h422
        }
    }), List::cons(f140(v2)?, List::cons(f29(List::cons(f55(Str::lit("closure")), List::cons(f55(v1), List::<Bytes>::nil()))), List::<Bytes>::nil()))))))))))
}

pub fn f116(v0: List<Adt6>, v1: bool, v2: Str) -> bool {
    let m423 = f137(v2, v0);
    match m423 {
        None => {
            false
        }
        Some(_) => {
            v1
        }
    }
}

pub fn f117(v0: Fn21, p427: List<Adt9>, p428: List<Adt6>) -> List<Adt9> {
    let m426 = (p427, p428);
    {
        let mut m426 = m426;
        loop {
            let step = {
                let (v1, v2) = m426;
                let m424 = v2;
                match m424.uncons() {
                    None => {
                        Err::<(List<Adt9>, List<Adt6>), List<Adt9>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Adt9>, List<Adt6>), List<Adt9>>(({
                            let c425: Fn21 = v0.clone();
                            c425.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m426 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f118(v0: List<Adt9>, v1: Adt6) -> List<Adt9> {
    let a430 = v0;
    let a431 = List::cons(match v1 {
        Adt6::C0(_, _, h429) => {
            h429
        }
    }, List::<Adt9>::nil());
    append_list(a430, a431)
}

pub fn f119(v0: List<Adt9>) -> bool {
    f141(Fn26::F142, true, v0)
}

pub fn f120(v0: Str, v1: List<(Str, bool)>) -> Option<bool> {
    f143(Fn27::F144(v0), None::<bool>, v1)
}

pub fn f121(v0: Fn22, p435: (Option<Bytes>, List<Bytes>), p436: List<Bytes>) -> (Option<Bytes>, List<Bytes>) {
    let m434 = (p435, p436);
    {
        let mut m434 = m434;
        loop {
            let step = {
                let (v1, v2) = m434;
                let m432 = v2;
                match m432.uncons() {
                    None => {
                        Err::<((Option<Bytes>, List<Bytes>), List<Bytes>), (Option<Bytes>, List<Bytes>)>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<((Option<Bytes>, List<Bytes>), List<Bytes>), (Option<Bytes>, List<Bytes>)>(({
                            let c433: Fn22 = v0.clone();
                            c433.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m434 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f122(v0: (Option<Bytes>, List<Bytes>), v1: Bytes) -> (Option<Bytes>, List<Bytes>) {
    f145(v0, v1)
}

pub fn f123(v0: List<Str>, v1: Bytes) -> R<bool> {
    let a437 = f146(v0.clone(), v1.clone(), true)?;
    let a438 = f146(v0, v1, false)?;
    Ok(nat_lt(a437, a438))
}

pub fn f124(v0: Fn23, p442: bool, p443: List<(Str, bool)>) -> bool {
    let m441 = (p442, p443);
    {
        let mut m441 = m441;
        loop {
            let step = {
                let (v1, v2) = m441;
                let m439 = v2;
                match m439.uncons() {
                    None => {
                        Err::<(bool, List<(Str, bool)>), bool>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(bool, List<(Str, bool)>), bool>(({
                            let c440: Fn23 = v0.clone();
                            c440.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m441 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f125(v0: Str, v1: bool, v2: (Str, bool)) -> bool {
    if v1 {
        true
    } else {
        let a445 = {
            let (h444, _) = v2;
            h444
        };
        let a446 = v0;
        if equal(a445, a446) {
            let a448 = {
                let (_, h447) = v2;
                h447
            };
            bool_not(a448)
        } else {
            false
        }
    }
}

pub fn f126(v0: Fn24, p452: bool, p453: List<Adt1>) -> bool {
    let m451 = (p452, p453);
    {
        let mut m451 = m451;
        loop {
            let step = {
                let (v1, v2) = m451;
                let m449 = v2;
                match m449.uncons() {
                    None => {
                        Err::<(bool, List<Adt1>), bool>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(bool, List<Adt1>), bool>(({
                            let c450: Fn24 = v0.clone();
                            c450.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m451 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f127(v0: Str, v1: Adt10, v2: Str, v3: bool, v4: Adt1) -> bool {
    if v3 {
        true
    } else {
        let a455 = match v4.clone() {
            Adt1::C0(h454, _, _, _, _, _) => {
                h454
            }
        };
        let a456 = v2;
        if equal(a455, a456) {
            let a458 = match v4.clone() {
                Adt1::C0(_, h457, _, _, _, _) => {
                    h457
                }
            };
            let a459 = v0;
            if equal(a458, a459) {
                if match v4.clone() {
                    Adt1::C0(_, _, h460, _, _, _) => {
                        h460
                    }
                } {
                    f45(v4, v1)
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        }
    }
}

pub fn f128(v0: Fn25, p465: u64, p466: u64) -> R<(u64, bool)> {
    let m464 = (p465, p466);
    {
        let mut m464 = m464;
        loop {
            let step = {
                let (v1, v2) = m464;
                let m461 = v1;
                if m461 == 0 {
                    Err::<(u64, u64), R<(u64, bool)>>(Ok((v2, false)))
                } else {
                    let v3 = m461 - 1;
                    let m463 = {
                        let c462: Fn25 = v0.clone();
                        c462.apply(v2)?
                    };
                    match m463 {
                        None => {
                            Err::<(u64, u64), R<(u64, bool)>>(Ok((v2, true)))
                        }
                        Some(v4) => {
                            Ok::<(u64, u64), R<(u64, bool)>>((v3, v4))
                        }
                    }
                }
            };
            match step {
                Ok(next) => { m464 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f129(v0: Bytes, v1: u64, v2: Bytes, v3: u64, v4: u64) -> R<Option<u64>> {
    if f130(v2, v0, v4) {
        Ok(None::<u64>)
    } else {
        let a469 = {
            let a467 = v4;
            let a468 = v1;
            nat_add(a467, a468)?
        };
        let a470 = v3;
        if nat_lt(a469, a470) {
            Ok(Some({
                let a471 = v4;
                let a472 = 1u64;
                nat_add(a471, a472)?
            }))
        } else {
            Ok(None::<u64>)
        }
    }
}

pub fn f130(v0: Bytes, v1: Bytes, v2: u64) -> bool {
    let m477 = {
        let a474 = v0;
        let a475 = v2;
        let a476 = {
            let a473 = v1.clone();
            length_bytes(a473)
        };
        slice_bytes(a474, a475, a476)
    };
    match m477 {
        None => {
            false
        }
        Some(v3) => {
            let a478 = v3;
            let a479 = v1;
            equal(a478, a479)
        }
    }
}

pub fn f131(v0: Bytes, v1: Bytes) -> bool {
    let v2: u64 = {
        let a480 = v0.clone();
        length_bytes(a480)
    };
    let v3: u64 = {
        let a481 = v1.clone();
        length_bytes(a481)
    };
    let a482 = v3;
    let a483 = v2;
    if nat_le(a482, a483) {
        let m489 = {
            let a486 = v0;
            let a487 = {
                let a484 = v2;
                let a485 = v3;
                nat_sub(a484, a485)
            };
            let a488 = v3;
            slice_bytes(a486, a487, a488)
        };
        match m489 {
            None => {
                false
            }
            Some(v4) => {
                let a490 = v4;
                let a491 = v1;
                equal(a490, a491)
            }
        }
    } else {
        false
    }
}

pub fn f132(v0: Adt7) -> Adt7 {
    Adt7::C0(match v0.clone() {
        Adt7::C0(h492, _, _, _, _, _) => {
            h492
        }
    }, match v0.clone() {
        Adt7::C0(_, h493, _, _, _, _) => {
            h493
        }
    }, Str::lit("prism"), match v0.clone() {
        Adt7::C0(_, _, _, h494, _, _) => {
            h494
        }
    }, match v0.clone() {
        Adt7::C0(_, _, _, _, h495, _) => {
            h495
        }
    }, match v0 {
        Adt7::C0(_, _, _, _, _, h496) => {
            h496
        }
    })
}

pub fn f133(p503: List<Str>, p504: List<Str>) -> bool {
    let m502 = (p503, p504);
    {
        let mut m502 = m502;
        loop {
            let step = {
                let (v0, v1) = m502;
                let m497 = v0;
                match m497.uncons() {
                    None => {
                        let m498 = v1;
                        match m498.uncons() {
                            None => {
                                Err::<(List<Str>, List<Str>), bool>(true)
                            }
                            Some((_, _)) => {
                                Err::<(List<Str>, List<Str>), bool>(false)
                            }
                        }
                    }
                    Some((v4, v5)) => {
                        let m499 = v1;
                        match m499.uncons() {
                            None => {
                                Err::<(List<Str>, List<Str>), bool>(false)
                            }
                            Some((v6, v7)) => {
                                let a500 = v4;
                                let a501 = v6;
                                if equal(a500, a501) {
                                    Ok::<(List<Str>, List<Str>), bool>((v5, v7))
                                } else {
                                    Err::<(List<Str>, List<Str>), bool>(false)
                                }
                            }
                        }
                    }
                }
            };
            match step {
                Ok(next) => { m502 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f134(v0: Adt13) -> Bytes {
    let a525 = f147(match v0.clone() {
        Adt13::C0(h505, _, _, _, _, _, _, _) => {
            h505
        }
    });
    let a526 = {
        let a523 = f147(match v0.clone() {
            Adt13::C0(_, h506, _, _, _, _, _, _) => {
                h506
            }
        });
        let a524 = {
            let a521 = f147(match v0.clone() {
                Adt13::C0(_, _, h507, _, _, _, _, _) => {
                    h507
                }
            });
            let a522 = {
                let a519 = f147(match v0.clone() {
                    Adt13::C0(_, _, _, h508, _, _, _, _) => {
                        h508
                    }
                });
                let a520 = {
                    let a517 = f147(match v0.clone() {
                        Adt13::C0(_, _, _, _, h509, _, _, _) => {
                            h509
                        }
                    });
                    let a518 = {
                        let a515 = f147(match v0.clone() {
                            Adt13::C0(_, _, _, _, _, h510, _, _) => {
                                h510
                            }
                        });
                        let a516 = {
                            let a513 = f147(match v0.clone() {
                                Adt13::C0(_, _, _, _, _, _, h511, _) => {
                                    h511
                                }
                            });
                            let a514 = f147(match v0 {
                                Adt13::C0(_, _, _, _, _, _, _, h512) => {
                                    h512
                                }
                            });
                            append_bytes(a513, a514)
                        };
                        append_bytes(a515, a516)
                    };
                    append_bytes(a517, a518)
                };
                append_bytes(a519, a520)
            };
            append_bytes(a521, a522)
        };
        append_bytes(a523, a524)
    };
    append_bytes(a525, a526)
}

pub fn f135(v0: Bytes) -> R<Adt13> {
    let v1: u64 = {
        let a527 = v0.clone();
        length_bytes(a527)
    };
    let v2: u64 = {
        let a533 = {
            let a530 = {
                let a528 = v1;
                let a529 = 72u64;
                nat_add(a528, a529)?
            };
            let a531 = 64u64;
            let a532 = 0u64;
            nat_quot(a530, a531, a532)
        };
        let a534 = 64u64;
        nat_mul(a533, a534)?
    };
    let (_, h535) = f148(Fn28::F149(v0, v1, v2), {
        let a536 = v2;
        let a537 = 64u64;
        let a538 = 0u64;
        nat_quot(a536, a537, a538)
    }, (0u64, f150()))?;
    Ok(h535)
}

pub fn f136(v0: List<Str>, v1: List<Bytes>, v2: (Bytes, Bytes)) -> R<List<Bytes>> {
    if f123(v0, {
        let (_, h539) = v2.clone();
        h539
    })? {
        Ok(List::cons(f29(List::cons(f55(Str::lit("file")), List::cons({
            let (h540, _) = v2;
            h540
        }, List::cons({
            let (_, h541) = v2;
            h541
        }, List::<Bytes>::nil())))), v1))
    } else {
        Ok(v1)
    }
}

pub fn f137(v0: Str, v1: List<Adt6>) -> Option<Adt6> {
    f151(Fn29::F152(v0), None::<Adt6>, v1)
}

pub fn f138(v0: Adt8) -> Str {
    let m542 = v0;
    match m542 {
        Adt8::C0 => {
            Str::lit("hermetic")
        }
        Adt8::C1 => {
            Str::lit("fetch")
        }
    }
}

pub fn f139(v0: Str, v1: List<Str>) -> Bytes {
    f6(f30(Fn6::F153(v0), List::<Bytes>::nil(), v1))
}

pub fn f140(v0: List<Adt6>) -> R<Bytes> {
    Ok(f6(f7(Fn0::F154, List::<Bytes>::nil(), v0)?))
}

pub fn f141(v0: Fn26, p546: bool, p547: List<Adt9>) -> bool {
    let m545 = (p546, p547);
    {
        let mut m545 = m545;
        loop {
            let step = {
                let (v1, v2) = m545;
                let m543 = v2;
                match m543.uncons() {
                    None => {
                        Err::<(bool, List<Adt9>), bool>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(bool, List<Adt9>), bool>(({
                            let c544: Fn26 = v0.clone();
                            c544.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m545 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f142(v0: bool, v1: Adt9) -> bool {
    if v0 {
        f96(v1)
    } else {
        false
    }
}

pub fn f143(v0: Fn27, p551: Option<bool>, p552: List<(Str, bool)>) -> Option<bool> {
    let m550 = (p551, p552);
    {
        let mut m550 = m550;
        loop {
            let step = {
                let (v1, v2) = m550;
                let m548 = v2;
                match m548.uncons() {
                    None => {
                        Err::<(Option<bool>, List<(Str, bool)>), Option<bool>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(Option<bool>, List<(Str, bool)>), Option<bool>>(({
                            let c549: Fn27 = v0.clone();
                            c549.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m550 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f144(v0: Str, v1: Option<bool>, v2: (Str, bool)) -> Option<bool> {
    let a554 = {
        let (h553, _) = v2;
        h553
    };
    let a555 = v0;
    if equal(a554, a555) {
        let m556 = v1;
        match m556 {
            None => {
                Some({
                    let (_, h558) = v2;
                    h558
                })
            }
            Some(v3) => {
                Some(if v3 {
                    true
                } else {
                    let (_, h557) = v2;
                    h557
                })
            }
        }
    } else {
        v1
    }
}

pub fn f145(v0: (Option<Bytes>, List<Bytes>), v1: Bytes) -> (Option<Bytes>, List<Bytes>) {
    let m560 = {
        let (h559, _) = v0;
        h559
    };
    match m560 {
        None => {
            (Some(v1), {
                let (_, h561) = v0;
                h561
            })
        }
        Some(v2) => {
            (None::<Bytes>, List::cons({
                let a562 = v2;
                let a563 = v1;
                append_bytes(a562, a563)
            }, {
                let (_, h564) = v0;
                h564
            }))
        }
    }
}

pub fn f146(v0: List<Str>, v1: Bytes, v2: bool) -> R<u64> {
    f155(Fn30::F156(v2, v1), 0u64, v0)
}

pub fn f147(v0: u32) -> Bytes {
    let a593 = f157({
        let a565 = f158(v0, 28u32);
        let a566 = 15u32;
        fixed_u32::bit_and(a565, a566)
    });
    let a594 = {
        let a591 = f157({
            let a567 = f158(v0, 24u32);
            let a568 = 15u32;
            fixed_u32::bit_and(a567, a568)
        });
        let a592 = {
            let a589 = f157({
                let a569 = f158(v0, 20u32);
                let a570 = 15u32;
                fixed_u32::bit_and(a569, a570)
            });
            let a590 = {
                let a587 = f157({
                    let a571 = f158(v0, 16u32);
                    let a572 = 15u32;
                    fixed_u32::bit_and(a571, a572)
                });
                let a588 = {
                    let a585 = f157({
                        let a573 = f158(v0, 12u32);
                        let a574 = 15u32;
                        fixed_u32::bit_and(a573, a574)
                    });
                    let a586 = {
                        let a583 = f157({
                            let a575 = f158(v0, 8u32);
                            let a576 = 15u32;
                            fixed_u32::bit_and(a575, a576)
                        });
                        let a584 = {
                            let a581 = f157({
                                let a577 = f158(v0, 4u32);
                                let a578 = 15u32;
                                fixed_u32::bit_and(a577, a578)
                            });
                            let a582 = f157({
                                let a579 = v0;
                                let a580 = 15u32;
                                fixed_u32::bit_and(a579, a580)
                            });
                            append_bytes(a581, a582)
                        };
                        append_bytes(a583, a584)
                    };
                    append_bytes(a585, a586)
                };
                append_bytes(a587, a588)
            };
            append_bytes(a589, a590)
        };
        append_bytes(a591, a592)
    };
    append_bytes(a593, a594)
}

pub fn f148(v0: Fn28, p598: u64, p599: (u64, Adt13)) -> R<(u64, Adt13)> {
    let m597 = (p598, p599);
    {
        let mut m597 = m597;
        loop {
            let step = {
                let (v1, v2) = m597;
                let m595 = v1;
                if m595 == 0 {
                    Err::<(u64, (u64, Adt13)), R<(u64, Adt13)>>(Ok(v2))
                } else {
                    let v3 = m595 - 1;
                    Ok::<(u64, (u64, Adt13)), R<(u64, Adt13)>>((v3, {
                        let c596: Fn28 = v0.clone();
                        c596.apply(v2)?
                    }))
                }
            };
            match step {
                Ok(next) => { m597 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f149(v0: Bytes, v1: u64, v2: u64, v3: (u64, Adt13)) -> R<(u64, Adt13)> {
    Ok(({
        let a601 = {
            let (h600, _) = v3.clone();
            h600
        };
        let a602 = 64u64;
        nat_add(a601, a602)?
    }, f159({
        let (_, h603) = v3;
        h603
    }, f160(v0, v1, v2, {
        let (h604, _) = v3;
        h604
    })?)?))
}

pub fn f150() -> Adt13 {
    Adt13::C0(1779033703u32, 3144134277u32, 1013904242u32, 2773480762u32, 1359893119u32, 2600822924u32, 528734635u32, 1541459225u32)
}

pub fn f151(v0: Fn29, p608: Option<Adt6>, p609: List<Adt6>) -> Option<Adt6> {
    let m607 = (p608, p609);
    {
        let mut m607 = m607;
        loop {
            let step = {
                let (v1, v2) = m607;
                let m605 = v2;
                match m605.uncons() {
                    None => {
                        Err::<(Option<Adt6>, List<Adt6>), Option<Adt6>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(Option<Adt6>, List<Adt6>), Option<Adt6>>(({
                            let c606: Fn29 = v0.clone();
                            c606.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m607 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f152(v0: Str, v1: Option<Adt6>, v2: Adt6) -> Option<Adt6> {
    let a613 = {
        let m612 = match v2.clone() {
            Adt6::C0(h611, _, _) => {
                h611
            }
        };
        match m612 {
            Adt7::C0(h610, _, _, _, _, _) => {
                h610
            }
        }
    };
    let a614 = v0;
    if equal(a613, a614) {
        Some(v2)
    } else {
        v1
    }
}

pub fn f153(v0: Str, v1: List<Bytes>, v2: Str) -> List<Bytes> {
    List::cons(f29(List::cons(f55(v0), List::cons(f55(v2), List::<Bytes>::nil()))), v1)
}

pub fn f154(v0: List<Bytes>, v1: Adt6) -> List<Bytes> {
    List::cons(f29(List::cons(f55(Str::lit("needs")), List::cons(f55({
        let m617 = match v1.clone() {
            Adt6::C0(h616, _, _) => {
                h616
            }
        };
        match m617 {
            Adt7::C0(h615, _, _, _, _, _) => {
                h615
            }
        }
    }), List::cons(f55(match v1 {
        Adt6::C0(_, h618, _) => {
            h618
        }
    }), List::<Bytes>::nil())))), v0)
}

pub fn f155(v0: Fn30, p622: u64, p623: List<Str>) -> R<u64> {
    let m621 = (p622, p623);
    {
        let mut m621 = m621;
        loop {
            let step = {
                let (v1, v2) = m621;
                let m619 = v2;
                match m619.uncons() {
                    None => {
                        Err::<(u64, List<Str>), R<u64>>(Ok(v1))
                    }
                    Some((v3, v4)) => {
                        Ok::<(u64, List<Str>), R<u64>>(({
                            let c620: Fn30 = v0.clone();
                            c620.apply(v1, v3)?
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m621 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f156(v0: bool, v1: Bytes, v2: u64, v3: Str) -> R<u64> {
    let a624 = f161(v3.clone(), Bytes::lit(&[0x21]));
    let a625 = v0;
    if equal(a624, a625) {
        let v4: u64 = f162(v3, v1)?;
        let a626 = v2;
        let a627 = v4;
        if nat_lt(a626, a627) {
            Ok(v4)
        } else {
            Ok(v2)
        }
    } else {
        Ok(v2)
    }
}

pub fn f157(v0: u32) -> Bytes {
    let a630 = {
        let a628 = v0;
        let a629 = 8u32;
        fixed_u32::bit_and(a628, a629)
    };
    let a631 = 0u32;
    if equal(a630, a631) {
        let a634 = {
            let a632 = v0;
            let a633 = 4u32;
            fixed_u32::bit_and(a632, a633)
        };
        let a635 = 0u32;
        if equal(a634, a635) {
            let a638 = {
                let a636 = v0;
                let a637 = 2u32;
                fixed_u32::bit_and(a636, a637)
            };
            let a639 = 0u32;
            if equal(a638, a639) {
                let a642 = {
                    let a640 = v0;
                    let a641 = 1u32;
                    fixed_u32::bit_and(a640, a641)
                };
                let a643 = 0u32;
                if equal(a642, a643) {
                    Bytes::lit(&[0x30])
                } else {
                    Bytes::lit(&[0x31])
                }
            } else {
                let a646 = {
                    let a644 = v0;
                    let a645 = 1u32;
                    fixed_u32::bit_and(a644, a645)
                };
                let a647 = 0u32;
                if equal(a646, a647) {
                    Bytes::lit(&[0x32])
                } else {
                    Bytes::lit(&[0x33])
                }
            }
        } else {
            let a650 = {
                let a648 = v0;
                let a649 = 2u32;
                fixed_u32::bit_and(a648, a649)
            };
            let a651 = 0u32;
            if equal(a650, a651) {
                let a654 = {
                    let a652 = v0;
                    let a653 = 1u32;
                    fixed_u32::bit_and(a652, a653)
                };
                let a655 = 0u32;
                if equal(a654, a655) {
                    Bytes::lit(&[0x34])
                } else {
                    Bytes::lit(&[0x35])
                }
            } else {
                let a658 = {
                    let a656 = v0;
                    let a657 = 1u32;
                    fixed_u32::bit_and(a656, a657)
                };
                let a659 = 0u32;
                if equal(a658, a659) {
                    Bytes::lit(&[0x36])
                } else {
                    Bytes::lit(&[0x37])
                }
            }
        }
    } else {
        let a662 = {
            let a660 = v0;
            let a661 = 4u32;
            fixed_u32::bit_and(a660, a661)
        };
        let a663 = 0u32;
        if equal(a662, a663) {
            let a666 = {
                let a664 = v0;
                let a665 = 2u32;
                fixed_u32::bit_and(a664, a665)
            };
            let a667 = 0u32;
            if equal(a666, a667) {
                let a670 = {
                    let a668 = v0;
                    let a669 = 1u32;
                    fixed_u32::bit_and(a668, a669)
                };
                let a671 = 0u32;
                if equal(a670, a671) {
                    Bytes::lit(&[0x38])
                } else {
                    Bytes::lit(&[0x39])
                }
            } else {
                let a674 = {
                    let a672 = v0;
                    let a673 = 1u32;
                    fixed_u32::bit_and(a672, a673)
                };
                let a675 = 0u32;
                if equal(a674, a675) {
                    Bytes::lit(&[0x61])
                } else {
                    Bytes::lit(&[0x62])
                }
            }
        } else {
            let a678 = {
                let a676 = v0;
                let a677 = 2u32;
                fixed_u32::bit_and(a676, a677)
            };
            let a679 = 0u32;
            if equal(a678, a679) {
                let a682 = {
                    let a680 = v0;
                    let a681 = 1u32;
                    fixed_u32::bit_and(a680, a681)
                };
                let a683 = 0u32;
                if equal(a682, a683) {
                    Bytes::lit(&[0x63])
                } else {
                    Bytes::lit(&[0x64])
                }
            } else {
                let a686 = {
                    let a684 = v0;
                    let a685 = 1u32;
                    fixed_u32::bit_and(a684, a685)
                };
                let a687 = 0u32;
                if equal(a686, a687) {
                    Bytes::lit(&[0x65])
                } else {
                    Bytes::lit(&[0x66])
                }
            }
        }
    }
}

pub fn f158(v0: u32, v1: u32) -> u32 {
    let m690 = {
        let a688 = v0;
        let a689 = v1;
        fixed_u32::shift_right(a688, a689)
    };
    match m690 {
        None => {
            0u32
        }
        Some(v2) => {
            v2
        }
    }
}

pub fn f159(v0: Adt13, v1: Adt14) -> R<Adt13> {
    let v2: Adt15 = f163(Fn31::F164, 64u64, Adt15::C0(match v0.clone() {
        Adt13::C0(h691, _, _, _, _, _, _, _) => {
            h691
        }
    }, match v0.clone() {
        Adt13::C0(_, h692, _, _, _, _, _, _) => {
            h692
        }
    }, match v0.clone() {
        Adt13::C0(_, _, h693, _, _, _, _, _) => {
            h693
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, h694, _, _, _, _) => {
            h694
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, h695, _, _, _) => {
            h695
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, h696, _, _) => {
            h696
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, h697, _) => {
            h697
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, _, h698) => {
            h698
        }
    }, v1, 0u64))?;
    Ok(Adt13::C0(f165(match v0.clone() {
        Adt13::C0(h699, _, _, _, _, _, _, _) => {
            h699
        }
    }, match v2.clone() {
        Adt15::C0(h700, _, _, _, _, _, _, _, _, _) => {
            h700
        }
    }), f165(match v0.clone() {
        Adt13::C0(_, h701, _, _, _, _, _, _) => {
            h701
        }
    }, match v2.clone() {
        Adt15::C0(_, h702, _, _, _, _, _, _, _, _) => {
            h702
        }
    }), f165(match v0.clone() {
        Adt13::C0(_, _, h703, _, _, _, _, _) => {
            h703
        }
    }, match v2.clone() {
        Adt15::C0(_, _, h704, _, _, _, _, _, _, _) => {
            h704
        }
    }), f165(match v0.clone() {
        Adt13::C0(_, _, _, h705, _, _, _, _) => {
            h705
        }
    }, match v2.clone() {
        Adt15::C0(_, _, _, h706, _, _, _, _, _, _) => {
            h706
        }
    }), f165(match v0.clone() {
        Adt13::C0(_, _, _, _, h707, _, _, _) => {
            h707
        }
    }, match v2.clone() {
        Adt15::C0(_, _, _, _, h708, _, _, _, _, _) => {
            h708
        }
    }), f165(match v0.clone() {
        Adt13::C0(_, _, _, _, _, h709, _, _) => {
            h709
        }
    }, match v2.clone() {
        Adt15::C0(_, _, _, _, _, h710, _, _, _, _) => {
            h710
        }
    }), f165(match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, h711, _) => {
            h711
        }
    }, match v2.clone() {
        Adt15::C0(_, _, _, _, _, _, h712, _, _, _) => {
            h712
        }
    }), f165(match v0 {
        Adt13::C0(_, _, _, _, _, _, _, h713) => {
            h713
        }
    }, match v2 {
        Adt15::C0(_, _, _, _, _, _, _, h714, _, _) => {
            h714
        }
    })))
}

pub fn f160(v0: Bytes, v1: u64, v2: u64, v3: u64) -> R<Adt14> {
    Ok(Adt14::C0(f166(v0.clone(), v1, v2, v3)?, f166(v0.clone(), v1, v2, {
        let a715 = v3;
        let a716 = 4u64;
        nat_add(a715, a716)?
    })?, f166(v0.clone(), v1, v2, {
        let a717 = v3;
        let a718 = 8u64;
        nat_add(a717, a718)?
    })?, f166(v0.clone(), v1, v2, {
        let a719 = v3;
        let a720 = 12u64;
        nat_add(a719, a720)?
    })?, f166(v0.clone(), v1, v2, {
        let a721 = v3;
        let a722 = 16u64;
        nat_add(a721, a722)?
    })?, f166(v0.clone(), v1, v2, {
        let a723 = v3;
        let a724 = 20u64;
        nat_add(a723, a724)?
    })?, f166(v0.clone(), v1, v2, {
        let a725 = v3;
        let a726 = 24u64;
        nat_add(a725, a726)?
    })?, f166(v0.clone(), v1, v2, {
        let a727 = v3;
        let a728 = 28u64;
        nat_add(a727, a728)?
    })?, f166(v0.clone(), v1, v2, {
        let a729 = v3;
        let a730 = 32u64;
        nat_add(a729, a730)?
    })?, f166(v0.clone(), v1, v2, {
        let a731 = v3;
        let a732 = 36u64;
        nat_add(a731, a732)?
    })?, f166(v0.clone(), v1, v2, {
        let a733 = v3;
        let a734 = 40u64;
        nat_add(a733, a734)?
    })?, f166(v0.clone(), v1, v2, {
        let a735 = v3;
        let a736 = 44u64;
        nat_add(a735, a736)?
    })?, f166(v0.clone(), v1, v2, {
        let a737 = v3;
        let a738 = 48u64;
        nat_add(a737, a738)?
    })?, f166(v0.clone(), v1, v2, {
        let a739 = v3;
        let a740 = 52u64;
        nat_add(a739, a740)?
    })?, f166(v0.clone(), v1, v2, {
        let a741 = v3;
        let a742 = 56u64;
        nat_add(a741, a742)?
    })?, f166(v0, v1, v2, {
        let a743 = v3;
        let a744 = 60u64;
        nat_add(a743, a744)?
    })?))
}

pub fn f161(v0: Str, v1: Bytes) -> bool {
    f167(f55(v0), v1)
}

pub fn f162(v0: Str, v1: Bytes) -> R<u64> {
    let v2: Bytes = if f161(v0.clone(), Bytes::lit(&[0x21])) {
        f168(v0)
    } else {
        f55(v0)
    };
    if f167(v1.clone(), v2.clone()) {
        if f167(v1, Bytes::lit(&[0x40])) {
            if f167(v2.clone(), Bytes::lit(&[0x40])) {
                let a746 = {
                    let a745 = v2;
                    length_bytes(a745)
                };
                let a747 = 1u64;
                nat_add(a746, a747)
            } else {
                Ok(0u64)
            }
        } else {
            let a749 = {
                let a748 = v2;
                length_bytes(a748)
            };
            let a750 = 1u64;
            nat_add(a749, a750)
        }
    } else {
        Ok(0u64)
    }
}

pub fn f163(v0: Fn31, p754: u64, p755: Adt15) -> R<Adt15> {
    let m753 = (p754, p755);
    {
        let mut m753 = m753;
        loop {
            let step = {
                let (v1, v2) = m753;
                let m751 = v1;
                if m751 == 0 {
                    Err::<(u64, Adt15), R<Adt15>>(Ok(v2))
                } else {
                    let v3 = m751 - 1;
                    Ok::<(u64, Adt15), R<Adt15>>((v3, {
                        let c752: Fn31 = v0.clone();
                        c752.apply(v2)?
                    }))
                }
            };
            match step {
                Ok(next) => { m753 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f164(v0: Adt15) -> R<Adt15> {
    f169(v0)
}

pub fn f165(v0: u32, v1: u32) -> u32 {
    let m758 = {
        let a756 = f170(v0);
        let a757 = f170(v1);
        fixed_u64::checked_add(a756, a757)
    };
    match m758 {
        None => {
            0u32
        }
        Some(v2) => {
            f171(v2)
        }
    }
}

pub fn f166(v0: Bytes, v1: u64, v2: u64, v3: u64) -> R<u32> {
    let a761 = {
        let a759 = v3;
        let a760 = 8u64;
        nat_add(a759, a760)?
    };
    let a762 = v2;
    if nat_eq(a761, a762) {
        Ok(f172({
            let a765 = {
                let a763 = v1;
                let a764 = 8u64;
                nat_mul(a763, a764)?
            };
            let a766 = 4294967296u64;
            let a767 = 0u64;
            nat_quot(a765, a766, a767)
        }))
    } else {
        let a770 = {
            let a768 = v3;
            let a769 = 4u64;
            nat_add(a768, a769)?
        };
        let a771 = v2;
        if nat_eq(a770, a771) {
            Ok(f172({
                let a774 = {
                    let a772 = v1;
                    let a773 = 8u64;
                    nat_mul(a772, a773)?
                };
                let a775 = 4294967296u64;
                let a776 = 0u64;
                nat_rem(a774, a775, a776)
            }))
        } else {
            Ok(f173(f174(v0.clone(), v1, v3), f174(v0.clone(), v1, {
                let a777 = v3;
                let a778 = 1u64;
                nat_add(a777, a778)?
            }), f174(v0.clone(), v1, {
                let a779 = v3;
                let a780 = 2u64;
                nat_add(a779, a780)?
            }), f174(v0, v1, {
                let a781 = v3;
                let a782 = 3u64;
                nat_add(a781, a782)?
            })))
        }
    }
}

pub fn f167(v0: Bytes, v1: Bytes) -> bool {
    let m787 = {
        let a784 = v0;
        let a785 = 0u64;
        let a786 = {
            let a783 = v1.clone();
            length_bytes(a783)
        };
        slice_bytes(a784, a785, a786)
    };
    match m787 {
        None => {
            false
        }
        Some(v2) => {
            let a788 = v2;
            let a789 = v1;
            equal(a788, a789)
        }
    }
}

pub fn f168(v0: Str) -> Bytes {
    let v1: Bytes = f55(v0);
    f37(v1.clone(), 1u64, {
        let a791 = {
            let a790 = v1;
            length_bytes(a790)
        };
        let a792 = 1u64;
        nat_sub(a791, a792)
    })
}

pub fn f169(v0: Adt15) -> R<Adt15> {
    let v1: u32 = f175(match v0.clone() {
        Adt15::C0(_, _, _, _, _, _, _, _, _, h793) => {
            h793
        }
    });
    let v2: u32 = f165(match v0.clone() {
        Adt15::C0(_, _, _, _, _, _, _, h794, _, _) => {
            h794
        }
    }, f165(f176(match v0.clone() {
        Adt15::C0(_, _, _, _, h795, _, _, _, _, _) => {
            h795
        }
    }), f165(f177(match v0.clone() {
        Adt15::C0(_, _, _, _, h796, _, _, _, _, _) => {
            h796
        }
    }, match v0.clone() {
        Adt15::C0(_, _, _, _, _, h797, _, _, _, _) => {
            h797
        }
    }, match v0.clone() {
        Adt15::C0(_, _, _, _, _, _, h798, _, _, _) => {
            h798
        }
    }), f165(v1, {
        let m801 = match v0.clone() {
            Adt15::C0(_, _, _, _, _, _, _, _, h800, _) => {
                h800
            }
        };
        match m801 {
            Adt14::C0(h799, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _) => {
                h799
            }
        }
    }))));
    let v3: u32 = f165(f178(match v0.clone() {
        Adt15::C0(h802, _, _, _, _, _, _, _, _, _) => {
            h802
        }
    }), f179(match v0.clone() {
        Adt15::C0(h803, _, _, _, _, _, _, _, _, _) => {
            h803
        }
    }, match v0.clone() {
        Adt15::C0(_, h804, _, _, _, _, _, _, _, _) => {
            h804
        }
    }, match v0.clone() {
        Adt15::C0(_, _, h805, _, _, _, _, _, _, _) => {
            h805
        }
    }));
    Ok(Adt15::C0(f165(v2, v3), match v0.clone() {
        Adt15::C0(h806, _, _, _, _, _, _, _, _, _) => {
            h806
        }
    }, match v0.clone() {
        Adt15::C0(_, h807, _, _, _, _, _, _, _, _) => {
            h807
        }
    }, match v0.clone() {
        Adt15::C0(_, _, h808, _, _, _, _, _, _, _) => {
            h808
        }
    }, f165(match v0.clone() {
        Adt15::C0(_, _, _, h809, _, _, _, _, _, _) => {
            h809
        }
    }, v2), match v0.clone() {
        Adt15::C0(_, _, _, _, h810, _, _, _, _, _) => {
            h810
        }
    }, match v0.clone() {
        Adt15::C0(_, _, _, _, _, h811, _, _, _, _) => {
            h811
        }
    }, match v0.clone() {
        Adt15::C0(_, _, _, _, _, _, h812, _, _, _) => {
            h812
        }
    }, f180(match v0.clone() {
        Adt15::C0(_, _, _, _, _, _, _, _, h813, _) => {
            h813
        }
    }), {
        let a815 = match v0 {
            Adt15::C0(_, _, _, _, _, _, _, _, _, h814) => {
                h814
            }
        };
        let a816 = 1u64;
        nat_add(a815, a816)?
    }))
}

pub fn f170(v0: u32) -> u64 {
    let m818 = {
        let a817 = v0;
        fixed_u64::convert(i128::from(a817))
    };
    match m818 {
        None => {
            0u64
        }
        Some(v1) => {
            v1
        }
    }
}

pub fn f171(v0: u64) -> u32 {
    let m822 = {
        let a821 = {
            let a819 = v0;
            let a820 = 4294967295u64;
            fixed_u64::bit_and(a819, a820)
        };
        fixed_u32::convert(i128::from(a821))
    };
    match m822 {
        None => {
            0u32
        }
        Some(v1) => {
            v1
        }
    }
}

pub fn f172(v0: u64) -> u32 {
    let (_, h823) = {
        let (_, h824) = f181(Fn32::F182, 32u64, (v0, (1u32, 0u32)));
        h824
    };
    h823
}

pub fn f173(v0: u32, v1: u32, v2: u32, v3: u32) -> u32 {
    let a829 = f183(v0, 24u32);
    let a830 = {
        let a827 = f183(v1, 16u32);
        let a828 = {
            let a825 = f183(v2, 8u32);
            let a826 = v3;
            fixed_u32::bit_or(a825, a826)
        };
        fixed_u32::bit_or(a827, a828)
    };
    fixed_u32::bit_or(a829, a830)
}

pub fn f174(v0: Bytes, v1: u64, v2: u64) -> u32 {
    let a831 = v2;
    let a832 = v1;
    if nat_lt(a831, a832) {
        let m835 = {
            let a833 = v0;
            let a834 = v2;
            index_bytes(a833, a834)
        };
        match m835 {
            None => {
                0u32
            }
            Some(v3) => {
                let m837 = {
                    let a836 = v3;
                    fixed_u32::convert(i128::from(a836))
                };
                match m837 {
                    None => {
                        0u32
                    }
                    Some(v4) => {
                        v4
                    }
                }
            }
        }
    } else {
        let a838 = v2;
        let a839 = v1;
        if nat_eq(a838, a839) {
            128u32
        } else {
            0u32
        }
    }
}

pub fn f175(v0: u64) -> u32 {
    let a840 = v0;
    let a841 = 32u64;
    if nat_lt(a840, a841) {
        let a842 = v0;
        let a843 = 16u64;
        if nat_lt(a842, a843) {
            let a844 = v0;
            let a845 = 8u64;
            if nat_lt(a844, a845) {
                let a846 = v0;
                let a847 = 4u64;
                if nat_lt(a846, a847) {
                    let a848 = v0;
                    let a849 = 2u64;
                    if nat_lt(a848, a849) {
                        let a850 = v0;
                        let a851 = 1u64;
                        if nat_lt(a850, a851) {
                            1116352408u32
                        } else {
                            1899447441u32
                        }
                    } else {
                        let a852 = v0;
                        let a853 = 3u64;
                        if nat_lt(a852, a853) {
                            3049323471u32
                        } else {
                            3921009573u32
                        }
                    }
                } else {
                    let a854 = v0;
                    let a855 = 6u64;
                    if nat_lt(a854, a855) {
                        let a856 = v0;
                        let a857 = 5u64;
                        if nat_lt(a856, a857) {
                            961987163u32
                        } else {
                            1508970993u32
                        }
                    } else {
                        let a858 = v0;
                        let a859 = 7u64;
                        if nat_lt(a858, a859) {
                            2453635748u32
                        } else {
                            2870763221u32
                        }
                    }
                }
            } else {
                let a860 = v0;
                let a861 = 12u64;
                if nat_lt(a860, a861) {
                    let a862 = v0;
                    let a863 = 10u64;
                    if nat_lt(a862, a863) {
                        let a864 = v0;
                        let a865 = 9u64;
                        if nat_lt(a864, a865) {
                            3624381080u32
                        } else {
                            310598401u32
                        }
                    } else {
                        let a866 = v0;
                        let a867 = 11u64;
                        if nat_lt(a866, a867) {
                            607225278u32
                        } else {
                            1426881987u32
                        }
                    }
                } else {
                    let a868 = v0;
                    let a869 = 14u64;
                    if nat_lt(a868, a869) {
                        let a870 = v0;
                        let a871 = 13u64;
                        if nat_lt(a870, a871) {
                            1925078388u32
                        } else {
                            2162078206u32
                        }
                    } else {
                        let a872 = v0;
                        let a873 = 15u64;
                        if nat_lt(a872, a873) {
                            2614888103u32
                        } else {
                            3248222580u32
                        }
                    }
                }
            }
        } else {
            let a874 = v0;
            let a875 = 24u64;
            if nat_lt(a874, a875) {
                let a876 = v0;
                let a877 = 20u64;
                if nat_lt(a876, a877) {
                    let a878 = v0;
                    let a879 = 18u64;
                    if nat_lt(a878, a879) {
                        let a880 = v0;
                        let a881 = 17u64;
                        if nat_lt(a880, a881) {
                            3835390401u32
                        } else {
                            4022224774u32
                        }
                    } else {
                        let a882 = v0;
                        let a883 = 19u64;
                        if nat_lt(a882, a883) {
                            264347078u32
                        } else {
                            604807628u32
                        }
                    }
                } else {
                    let a884 = v0;
                    let a885 = 22u64;
                    if nat_lt(a884, a885) {
                        let a886 = v0;
                        let a887 = 21u64;
                        if nat_lt(a886, a887) {
                            770255983u32
                        } else {
                            1249150122u32
                        }
                    } else {
                        let a888 = v0;
                        let a889 = 23u64;
                        if nat_lt(a888, a889) {
                            1555081692u32
                        } else {
                            1996064986u32
                        }
                    }
                }
            } else {
                let a890 = v0;
                let a891 = 28u64;
                if nat_lt(a890, a891) {
                    let a892 = v0;
                    let a893 = 26u64;
                    if nat_lt(a892, a893) {
                        let a894 = v0;
                        let a895 = 25u64;
                        if nat_lt(a894, a895) {
                            2554220882u32
                        } else {
                            2821834349u32
                        }
                    } else {
                        let a896 = v0;
                        let a897 = 27u64;
                        if nat_lt(a896, a897) {
                            2952996808u32
                        } else {
                            3210313671u32
                        }
                    }
                } else {
                    let a898 = v0;
                    let a899 = 30u64;
                    if nat_lt(a898, a899) {
                        let a900 = v0;
                        let a901 = 29u64;
                        if nat_lt(a900, a901) {
                            3336571891u32
                        } else {
                            3584528711u32
                        }
                    } else {
                        let a902 = v0;
                        let a903 = 31u64;
                        if nat_lt(a902, a903) {
                            113926993u32
                        } else {
                            338241895u32
                        }
                    }
                }
            }
        }
    } else {
        let a904 = v0;
        let a905 = 48u64;
        if nat_lt(a904, a905) {
            let a906 = v0;
            let a907 = 40u64;
            if nat_lt(a906, a907) {
                let a908 = v0;
                let a909 = 36u64;
                if nat_lt(a908, a909) {
                    let a910 = v0;
                    let a911 = 34u64;
                    if nat_lt(a910, a911) {
                        let a912 = v0;
                        let a913 = 33u64;
                        if nat_lt(a912, a913) {
                            666307205u32
                        } else {
                            773529912u32
                        }
                    } else {
                        let a914 = v0;
                        let a915 = 35u64;
                        if nat_lt(a914, a915) {
                            1294757372u32
                        } else {
                            1396182291u32
                        }
                    }
                } else {
                    let a916 = v0;
                    let a917 = 38u64;
                    if nat_lt(a916, a917) {
                        let a918 = v0;
                        let a919 = 37u64;
                        if nat_lt(a918, a919) {
                            1695183700u32
                        } else {
                            1986661051u32
                        }
                    } else {
                        let a920 = v0;
                        let a921 = 39u64;
                        if nat_lt(a920, a921) {
                            2177026350u32
                        } else {
                            2456956037u32
                        }
                    }
                }
            } else {
                let a922 = v0;
                let a923 = 44u64;
                if nat_lt(a922, a923) {
                    let a924 = v0;
                    let a925 = 42u64;
                    if nat_lt(a924, a925) {
                        let a926 = v0;
                        let a927 = 41u64;
                        if nat_lt(a926, a927) {
                            2730485921u32
                        } else {
                            2820302411u32
                        }
                    } else {
                        let a928 = v0;
                        let a929 = 43u64;
                        if nat_lt(a928, a929) {
                            3259730800u32
                        } else {
                            3345764771u32
                        }
                    }
                } else {
                    let a930 = v0;
                    let a931 = 46u64;
                    if nat_lt(a930, a931) {
                        let a932 = v0;
                        let a933 = 45u64;
                        if nat_lt(a932, a933) {
                            3516065817u32
                        } else {
                            3600352804u32
                        }
                    } else {
                        let a934 = v0;
                        let a935 = 47u64;
                        if nat_lt(a934, a935) {
                            4094571909u32
                        } else {
                            275423344u32
                        }
                    }
                }
            }
        } else {
            let a936 = v0;
            let a937 = 56u64;
            if nat_lt(a936, a937) {
                let a938 = v0;
                let a939 = 52u64;
                if nat_lt(a938, a939) {
                    let a940 = v0;
                    let a941 = 50u64;
                    if nat_lt(a940, a941) {
                        let a942 = v0;
                        let a943 = 49u64;
                        if nat_lt(a942, a943) {
                            430227734u32
                        } else {
                            506948616u32
                        }
                    } else {
                        let a944 = v0;
                        let a945 = 51u64;
                        if nat_lt(a944, a945) {
                            659060556u32
                        } else {
                            883997877u32
                        }
                    }
                } else {
                    let a946 = v0;
                    let a947 = 54u64;
                    if nat_lt(a946, a947) {
                        let a948 = v0;
                        let a949 = 53u64;
                        if nat_lt(a948, a949) {
                            958139571u32
                        } else {
                            1322822218u32
                        }
                    } else {
                        let a950 = v0;
                        let a951 = 55u64;
                        if nat_lt(a950, a951) {
                            1537002063u32
                        } else {
                            1747873779u32
                        }
                    }
                }
            } else {
                let a952 = v0;
                let a953 = 60u64;
                if nat_lt(a952, a953) {
                    let a954 = v0;
                    let a955 = 58u64;
                    if nat_lt(a954, a955) {
                        let a956 = v0;
                        let a957 = 57u64;
                        if nat_lt(a956, a957) {
                            1955562222u32
                        } else {
                            2024104815u32
                        }
                    } else {
                        let a958 = v0;
                        let a959 = 59u64;
                        if nat_lt(a958, a959) {
                            2227730452u32
                        } else {
                            2361852424u32
                        }
                    }
                } else {
                    let a960 = v0;
                    let a961 = 62u64;
                    if nat_lt(a960, a961) {
                        let a962 = v0;
                        let a963 = 61u64;
                        if nat_lt(a962, a963) {
                            2428436474u32
                        } else {
                            2756734187u32
                        }
                    } else {
                        let a964 = v0;
                        let a965 = 63u64;
                        if nat_lt(a964, a965) {
                            3204031479u32
                        } else {
                            3329325298u32
                        }
                    }
                }
            }
        }
    }
}

pub fn f176(v0: u32) -> u32 {
    let a968 = {
        let a966 = f184(v0, 6u32, 26u32);
        let a967 = f184(v0, 11u32, 21u32);
        fixed_u32::bit_xor(a966, a967)
    };
    let a969 = f184(v0, 25u32, 7u32);
    fixed_u32::bit_xor(a968, a969)
}

pub fn f177(v0: u32, v1: u32, v2: u32) -> u32 {
    let a975 = {
        let a970 = v0;
        let a971 = v1;
        fixed_u32::bit_and(a970, a971)
    };
    let a976 = {
        let a973 = {
            let a972 = v0;
            fixed_u32::bit_not(a972)
        };
        let a974 = v2;
        fixed_u32::bit_and(a973, a974)
    };
    fixed_u32::bit_xor(a975, a976)
}

pub fn f178(v0: u32) -> u32 {
    let a979 = {
        let a977 = f184(v0, 2u32, 30u32);
        let a978 = f184(v0, 13u32, 19u32);
        fixed_u32::bit_xor(a977, a978)
    };
    let a980 = f184(v0, 22u32, 10u32);
    fixed_u32::bit_xor(a979, a980)
}

pub fn f179(v0: u32, v1: u32, v2: u32) -> u32 {
    let a989 = {
        let a985 = {
            let a981 = v0;
            let a982 = v1;
            fixed_u32::bit_and(a981, a982)
        };
        let a986 = {
            let a983 = v0;
            let a984 = v2;
            fixed_u32::bit_and(a983, a984)
        };
        fixed_u32::bit_xor(a985, a986)
    };
    let a990 = {
        let a987 = v1;
        let a988 = v2;
        fixed_u32::bit_and(a987, a988)
    };
    fixed_u32::bit_xor(a989, a990)
}

pub fn f180(v0: Adt14) -> Adt14 {
    Adt14::C0(match v0.clone() {
        Adt14::C0(_, h991, _, _, _, _, _, _, _, _, _, _, _, _, _, _) => {
            h991
        }
    }, match v0.clone() {
        Adt14::C0(_, _, h992, _, _, _, _, _, _, _, _, _, _, _, _, _) => {
            h992
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, h993, _, _, _, _, _, _, _, _, _, _, _, _) => {
            h993
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, h994, _, _, _, _, _, _, _, _, _, _, _) => {
            h994
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, h995, _, _, _, _, _, _, _, _, _, _) => {
            h995
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, h996, _, _, _, _, _, _, _, _, _) => {
            h996
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, h997, _, _, _, _, _, _, _, _) => {
            h997
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, _, h998, _, _, _, _, _, _, _) => {
            h998
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, _, _, h999, _, _, _, _, _, _) => {
            h999
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, _, _, _, h1000, _, _, _, _, _) => {
            h1000
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, _, _, _, _, h1001, _, _, _, _) => {
            h1001
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, _, _, _, _, _, h1002, _, _, _) => {
            h1002
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, _, _, _, _, _, _, h1003, _, _) => {
            h1003
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, _, _, _, _, _, _, _, h1004, _) => {
            h1004
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, h1005) => {
            h1005
        }
    }, f165(f185(match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, _, _, _, _, _, _, _, h1006, _) => {
            h1006
        }
    }), f165(match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, _, _, h1007, _, _, _, _, _, _) => {
            h1007
        }
    }, f165(f186(match v0.clone() {
        Adt14::C0(_, h1008, _, _, _, _, _, _, _, _, _, _, _, _, _, _) => {
            h1008
        }
    }), match v0 {
        Adt14::C0(h1009, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _) => {
            h1009
        }
    }))))
}

pub fn f181(v0: Fn32, p1013: u64, p1014: (u64, (u32, u32))) -> (u64, (u32, u32)) {
    let m1012 = (p1013, p1014);
    {
        let mut m1012 = m1012;
        loop {
            let step = {
                let (v1, v2) = m1012;
                let m1010 = v1;
                if m1010 == 0 {
                    Err::<(u64, (u64, (u32, u32))), (u64, (u32, u32))>(v2)
                } else {
                    let v3 = m1010 - 1;
                    Ok::<(u64, (u64, (u32, u32))), (u64, (u32, u32))>((v3, {
                        let c1011: Fn32 = v0.clone();
                        c1011.apply(v2)
                    }))
                }
            };
            match step {
                Ok(next) => { m1012 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f182(v0: (u64, (u32, u32))) -> (u64, (u32, u32)) {
    let v1: u64 = {
        let (h1015, _) = v0;
        h1015
    };
    let v2: u32 = {
        let (h1016, _) = {
            let (_, h1017) = v0;
            h1017
        };
        h1016
    };
    let v3: u32 = {
        let (_, h1018) = {
            let (_, h1019) = v0;
            h1019
        };
        h1018
    };
    ({
        let a1020 = v1;
        let a1021 = 2u64;
        let a1022 = 0u64;
        nat_quot(a1020, a1021, a1022)
    }, (f183(v2, 1u32), {
        let a1026 = {
            let a1023 = v1;
            let a1024 = 2u64;
            let a1025 = 0u64;
            nat_rem(a1023, a1024, a1025)
        };
        let a1027 = 1u64;
        if nat_eq(a1026, a1027) {
            let a1028 = v3;
            let a1029 = v2;
            fixed_u32::bit_or(a1028, a1029)
        } else {
            v3
        }
    }))
}

pub fn f183(v0: u32, v1: u32) -> u32 {
    let m1032 = {
        let a1030 = v0;
        let a1031 = v1;
        fixed_u32::shift_left(a1030, a1031)
    };
    match m1032 {
        None => {
            0u32
        }
        Some(v2) => {
            v2
        }
    }
}

pub fn f184(v0: u32, v1: u32, v2: u32) -> u32 {
    let a1033 = f158(v0, v1);
    let a1034 = f183(v0, v2);
    fixed_u32::bit_or(a1033, a1034)
}

pub fn f185(v0: u32) -> u32 {
    let a1037 = {
        let a1035 = f184(v0, 17u32, 15u32);
        let a1036 = f184(v0, 19u32, 13u32);
        fixed_u32::bit_xor(a1035, a1036)
    };
    let a1038 = f158(v0, 10u32);
    fixed_u32::bit_xor(a1037, a1038)
}

pub fn f186(v0: u32) -> u32 {
    let a1041 = {
        let a1039 = f184(v0, 7u32, 25u32);
        let a1040 = f184(v0, 18u32, 14u32);
        fixed_u32::bit_xor(a1039, a1040)
    };
    let a1042 = f158(v0, 3u32);
    fixed_u32::bit_xor(a1041, a1042)
}
